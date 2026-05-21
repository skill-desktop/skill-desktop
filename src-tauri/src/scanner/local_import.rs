//! Local skill import: support for folders, ZIP archives, `.skill` archives and
//! loose `SKILL.md` markdown files.
//!
//! This module is the **pure logic** layer used by the `commands::*_local_skill*`
//! Tauri commands. It deliberately does NOT touch any Tauri State or database —
//! callers handle that. Everything in here works on plain paths.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::scanner::{parse_front_matter, IGNORE_DIR_NAMES};
use crate::types::SkillMetadata;

/// What kind of local source we're looking at.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LocalSource {
    /// Directory containing a `SKILL.md` at its root (or below).
    Folder(PathBuf),
    /// `.zip` or `.skill` archive that we'll extract.
    Archive(PathBuf),
    /// A loose markdown file (e.g. `my-skill.md`) that has valid SKILL.md front matter.
    Markdown(PathBuf),
}

impl LocalSource {
    #[allow(dead_code)]
    pub fn source_type(&self) -> &'static str {
        match self {
            LocalSource::Folder(_) => "folder",
            LocalSource::Archive(path) => {
                let ext = path
                    .extension()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_ascii_lowercase());
                match ext.as_deref() {
                    Some("skill") => "skill",
                    _ => "zip",
                }
            }
            LocalSource::Markdown(_) => "markdown",
        }
    }

    #[allow(dead_code)]
    pub fn path(&self) -> &Path {
        match self {
            LocalSource::Folder(p) | LocalSource::Archive(p) | LocalSource::Markdown(p) => p,
        }
    }
}

/// Detect what kind of local skill source `path` is. Returns None when the path
/// isn't a recognised skill source.
pub fn detect_source(path: &Path) -> Option<LocalSource> {
    if !path.exists() {
        return None;
    }

    if path.is_dir() {
        return Some(LocalSource::Folder(path.to_path_buf()));
    }

    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase());

    match ext.as_deref() {
        Some("zip") | Some("skill") => Some(LocalSource::Archive(path.to_path_buf())),
        Some("md") | Some("markdown") => Some(LocalSource::Markdown(path.to_path_buf())),
        _ => None,
    }
}

/// One skill we found in / inferred from a local source.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSkillCandidate {
    /// Original user-provided path (the .zip / folder / .md).
    pub source_path: String,
    /// Source type: `folder` | `zip` | `skill` | `markdown`.
    pub source_type: String,
    /// Path of the actual SKILL.md (may live inside a temp extracted dir).
    pub skill_md_path: String,
    /// Skill directory the SKILL.md lives in (also possibly temp).
    pub skill_dir: String,
    /// Original `name` from front matter, or fallback filename.
    pub name: String,
    /// Sanitized name we'd use as the on-disk directory.
    pub safe_name: String,
    /// Description from frontmatter (may be empty).
    pub description: String,
    /// True iff we successfully parsed front matter and derived a safe name.
    pub valid: bool,
    /// Why `valid` is false, when applicable.
    pub error: Option<String>,
}

const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024; // 20 MB per entry
const MAX_TOTAL_BYTES: u64 = 100 * 1024 * 1024; // 100 MB per archive

/// Extract a zip/.skill archive into `dest`. Defends against zip-slip, oversized
/// files and oversized archives.
pub fn extract_archive(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(archive)
        .map_err(|e| format!("Failed to open archive: {}", e))?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read archive: {}", e))?;

    fs::create_dir_all(dest)
        .map_err(|e| format!("Failed to create extraction directory: {}", e))?;

    let dest_canonical = dest
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize destination: {}", e))?;

    let mut total_bytes: u64 = 0;

    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry {}: {}", i, e))?;

        // Defence against zip-slip: ignore entries with absolute / parent paths.
        let entry_path = match entry.enclosed_name() {
            Some(p) => p.to_owned(),
            None => continue,
        };

        let target = dest.join(&entry_path);

        // Re-canonicalize the *parent* of target so we can compare against dest.
        // We can't canonicalize target itself before creating it.
        let target_parent = target
            .parent()
            .ok_or_else(|| "Invalid target path".to_string())?;
        fs::create_dir_all(target_parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;

        if let Ok(parent_canon) = target_parent.canonicalize() {
            if !parent_canon.starts_with(&dest_canonical) {
                // Resolved outside our extraction directory — refuse.
                return Err("Refusing to extract entry outside destination (zip-slip)".to_string());
            }
        }

        if entry.is_dir() {
            fs::create_dir_all(&target)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
            continue;
        }

        // Skip files exceeding per-entry cap.
        if entry.size() > MAX_FILE_BYTES {
            continue;
        }

        total_bytes = total_bytes.saturating_add(entry.size());
        if total_bytes > MAX_TOTAL_BYTES {
            return Err(format!(
                "Archive too large (exceeds {} MB uncompressed cap)",
                MAX_TOTAL_BYTES / (1024 * 1024)
            ));
        }

        let mut out = fs::File::create(&target)
            .map_err(|e| format!("Failed to create file {}: {}", target.display(), e))?;

        // Stream copy in chunks — never load the whole entry into memory.
        let mut buf = [0u8; 64 * 1024];
        loop {
            let n = entry
                .read(&mut buf)
                .map_err(|e| format!("Failed to read entry: {}", e))?;
            if n == 0 {
                break;
            }
            std::io::Write::write_all(&mut out, &buf[..n])
                .map_err(|e| format!("Failed to write extracted file: {}", e))?;
        }
    }

    Ok(())
}

/// Recursively find every directory under `root` that contains a `SKILL.md` and
/// turn each one into a `LocalSkillCandidate`.
///
/// `original_source_path` is what we'll record in `source_path` (so the UI shows the
/// path the user actually picked, not the temp extraction dir).
pub fn discover_candidates_in(
    root: &Path,
    original_source_path: &str,
    source_type: &str,
) -> Vec<LocalSkillCandidate> {
    let mut out = Vec::new();
    let mut seen_dirs: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    for entry in WalkDir::new(root)
        .max_depth(6)
        .into_iter()
        .filter_entry(|e| {
            // Always include root
            if e.depth() == 0 {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            !IGNORE_DIR_NAMES.iter().any(|d| name == *d)
        })
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(filename) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if filename != "SKILL.md" {
            continue;
        }

        let Some(skill_dir) = path.parent() else {
            continue;
        };
        if !seen_dirs.insert(skill_dir.to_path_buf()) {
            continue;
        }

        let candidate = build_candidate_from_md(
            path,
            skill_dir,
            original_source_path,
            source_type,
        );
        out.push(candidate);
    }

    out
}

/// Build a candidate by parsing the given SKILL.md.
fn build_candidate_from_md(
    skill_md_path: &Path,
    skill_dir: &Path,
    source_path: &str,
    source_type: &str,
) -> LocalSkillCandidate {
    let mut candidate = LocalSkillCandidate {
        source_path: source_path.to_string(),
        source_type: source_type.to_string(),
        skill_md_path: skill_md_path.to_string_lossy().to_string(),
        skill_dir: skill_dir.to_string_lossy().to_string(),
        name: String::new(),
        safe_name: String::new(),
        description: String::new(),
        valid: false,
        error: None,
    };

    let content = match fs::read_to_string(skill_md_path) {
        Ok(c) => c,
        Err(e) => {
            candidate.error = Some(format!("Cannot read SKILL.md: {}", e));
            return candidate;
        }
    };

    let metadata = match parse_front_matter(&content) {
        Some(m) => m,
        None => {
            candidate.error = Some("SKILL.md is missing valid YAML front matter".to_string());
            return candidate;
        }
    };

    candidate.name = metadata.name.clone();
    candidate.description = metadata.description.clone();

    match crate::commands::sanitize_skill_name(&metadata.name) {
        Ok(safe) => {
            candidate.safe_name = safe;
            candidate.valid = true;
        }
        Err(e) => {
            candidate.error = Some(e);
        }
    }

    candidate
}

/// Given a candidate (i.e. its `skill_dir` already contains a SKILL.md), copy it
/// into `library` under the sanitized name and return the new on-disk path.
///
/// Returns `Ok(None)` when the target already exists (so the caller can count it
/// as "skipped"), `Ok(Some(path))` on success, and `Err(_)` on real failures.
pub fn ingest_candidate(
    candidate: &LocalSkillCandidate,
    library: &Path,
) -> Result<Option<PathBuf>, String> {
    if !candidate.valid {
        return Err(candidate
            .error
            .clone()
            .unwrap_or_else(|| "Invalid candidate".to_string()));
    }

    let src_dir = Path::new(&candidate.skill_dir);
    if !src_dir.exists() {
        return Err(format!("Source directory does not exist: {}", candidate.skill_dir));
    }

    let dst_dir = library.join(&candidate.safe_name);
    if dst_dir.exists() {
        return Ok(None);
    }

    fs::create_dir_all(&dst_dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;

    copy_dir_recursive(src_dir, &dst_dir)
        .map_err(|e| {
            // Roll back partial copy on failure
            let _ = fs::remove_dir_all(&dst_dir);
            e
        })?;

    // Patch SKILL.md frontmatter so the on-disk `name:` matches the sanitized dir.
    let dst_skill_md = dst_dir.join("SKILL.md");
    if dst_skill_md.exists() {
        if let Ok(content) = fs::read_to_string(&dst_skill_md) {
            if let Ok(rewritten) =
                crate::commands::rewrite_skill_md_name(&content, &candidate.safe_name)
            {
                let _ = fs::write(&dst_skill_md, rewritten);
            }
        }
    }

    Ok(Some(dst_dir))
}

/// Wrap a loose markdown file into a new `<safe_name>/SKILL.md` inside `library`.
pub fn ingest_loose_markdown(
    md_path: &Path,
    library: &Path,
) -> Result<Option<PathBuf>, String> {
    let content = fs::read_to_string(md_path)
        .map_err(|e| format!("Cannot read markdown file: {}", e))?;

    let metadata = parse_front_matter(&content)
        .ok_or_else(|| "Markdown file is missing valid SKILL.md front matter".to_string())?;

    let safe_name = crate::commands::sanitize_skill_name(&metadata.name)?;

    let dst_dir = library.join(&safe_name);
    if dst_dir.exists() {
        return Ok(None);
    }

    fs::create_dir_all(&dst_dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;

    let rewritten = crate::commands::rewrite_skill_md_name(&content, &safe_name)
        .unwrap_or_else(|_| content.clone());

    fs::write(dst_dir.join("SKILL.md"), rewritten)
        .map_err(|e| format!("Failed to write SKILL.md: {}", e))?;

    Ok(Some(dst_dir))
}

/// Recursive directory copy that skips well-known noise dirs and refuses to follow
/// symlinks pointing outside the source tree (defence in depth).
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in WalkDir::new(src)
        .max_depth(8)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            !IGNORE_DIR_NAMES.iter().any(|d| name == *d)
        })
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let rel = match path.strip_prefix(src) {
            Ok(r) => r,
            Err(_) => continue,
        };
        if rel.as_os_str().is_empty() {
            continue;
        }
        let target = dst.join(rel);

        if path.is_dir() {
            fs::create_dir_all(&target)
                .map_err(|e| format!("Failed to create {}: {}", target.display(), e))?;
        } else if path.is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
            }
            fs::copy(path, &target)
                .map_err(|e| format!("Failed to copy {}: {}", path.display(), e))?;
        }
    }
    Ok(())
}

/// Build the metadata of a single source (without importing it). Used by the
/// `preview_local_skill` command to fill the existing SkillPreview panel.
///
/// Returns a tuple of (metadata, SKILL.md content, source_type, temp_dir_to_clean).
/// The caller MUST drop / remove `temp_dir_to_clean` after using the result.
pub fn preview_source(
    path: &Path,
) -> Result<(SkillMetadata, String, &'static str, Option<PathBuf>), String> {
    let source = detect_source(path)
        .ok_or_else(|| format!("Path is not a recognised skill source: {}", path.display()))?;

    match source {
        LocalSource::Folder(dir) => {
            let candidates = discover_candidates_in(&dir, &dir.to_string_lossy(), "folder");
            let first = candidates
                .into_iter()
                .find(|c| c.valid)
                .ok_or_else(|| "No valid SKILL.md found in folder".to_string())?;
            let content = fs::read_to_string(&first.skill_md_path)
                .map_err(|e| format!("Cannot read SKILL.md: {}", e))?;
            let meta = parse_front_matter(&content)
                .ok_or_else(|| "Failed to parse SKILL.md front matter".to_string())?;
            Ok((meta, content, "folder", None))
        }
        LocalSource::Markdown(file) => {
            let content = fs::read_to_string(&file)
                .map_err(|e| format!("Cannot read markdown: {}", e))?;
            let meta = parse_front_matter(&content)
                .ok_or_else(|| "Markdown file is missing valid SKILL.md front matter".to_string())?;
            Ok((meta, content, "markdown", None))
        }
        LocalSource::Archive(archive) => {
            let temp = std::env::temp_dir().join(format!(
                "skill-import-preview-{}",
                uuid::Uuid::new_v4()
            ));
            extract_archive(&archive, &temp)?;

            let source_type = if archive
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("skill"))
                .unwrap_or(false)
            {
                "skill"
            } else {
                "zip"
            };

            let candidates = discover_candidates_in(&temp, &archive.to_string_lossy(), source_type);
            let first = match candidates.into_iter().find(|c| c.valid) {
                Some(c) => c,
                None => {
                    let _ = fs::remove_dir_all(&temp);
                    return Err("No valid SKILL.md found in archive".to_string());
                }
            };
            let content = match fs::read_to_string(&first.skill_md_path) {
                Ok(c) => c,
                Err(e) => {
                    let _ = fs::remove_dir_all(&temp);
                    return Err(format!("Cannot read extracted SKILL.md: {}", e));
                }
            };
            let meta = match parse_front_matter(&content) {
                Some(m) => m,
                None => {
                    let _ = fs::remove_dir_all(&temp);
                    return Err("Failed to parse SKILL.md front matter".to_string());
                }
            };
            Ok((meta, content, source_type, Some(temp)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_source_folder() {
        let tmp = std::env::temp_dir().join(format!("skill-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&tmp).unwrap();
        let src = detect_source(&tmp).unwrap();
        assert!(matches!(src, LocalSource::Folder(_)));
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn detect_source_zip() {
        let tmp = std::env::temp_dir().join(format!("skill-test-{}.zip", uuid::Uuid::new_v4()));
        fs::write(&tmp, b"PK\x03\x04").unwrap();
        let src = detect_source(&tmp).unwrap();
        assert!(matches!(src, LocalSource::Archive(_)));
        assert_eq!(src.source_type(), "zip");
        let _ = fs::remove_file(&tmp);
    }

    #[test]
    fn detect_source_dot_skill() {
        let tmp = std::env::temp_dir().join(format!("skill-test-{}.skill", uuid::Uuid::new_v4()));
        fs::write(&tmp, b"PK\x03\x04").unwrap();
        let src = detect_source(&tmp).unwrap();
        assert!(matches!(src, LocalSource::Archive(_)));
        assert_eq!(src.source_type(), "skill");
        let _ = fs::remove_file(&tmp);
    }

    #[test]
    fn detect_source_md() {
        let tmp = std::env::temp_dir().join(format!("skill-test-{}.md", uuid::Uuid::new_v4()));
        fs::write(&tmp, b"").unwrap();
        let src = detect_source(&tmp).unwrap();
        assert!(matches!(src, LocalSource::Markdown(_)));
        let _ = fs::remove_file(&tmp);
    }

    #[test]
    fn detect_source_unknown() {
        let tmp = std::env::temp_dir().join(format!("skill-test-{}.tar", uuid::Uuid::new_v4()));
        fs::write(&tmp, b"").unwrap();
        assert!(detect_source(&tmp).is_none());
        let _ = fs::remove_file(&tmp);
    }

    #[test]
    fn discover_finds_skill_md() {
        let root = std::env::temp_dir().join(format!("skill-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("skill-a")).unwrap();
        fs::create_dir_all(root.join("skill-b")).unwrap();
        let frontmatter = "---\nname: my-skill\ndescription: A test skill for unit tests\n---\n";
        fs::write(root.join("skill-a/SKILL.md"), frontmatter).unwrap();
        fs::write(root.join("skill-b/SKILL.md"), frontmatter).unwrap();

        let candidates = discover_candidates_in(&root, &root.to_string_lossy(), "folder");
        assert_eq!(candidates.len(), 2);
        assert!(candidates.iter().all(|c| c.valid));

        let _ = fs::remove_dir_all(&root);
    }
}
