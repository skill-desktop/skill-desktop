use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

use crate::types::{Skill, SkillMetadata, SkillResource, SkillResources};

pub mod watcher;
pub mod risk_analyzer;

pub use watcher::FileWatcher;
pub use risk_analyzer::{analyze_file, analyze_content, RiskLevel};

/// Calculate SHA-256 hash of file contents
pub fn calculate_file_hash(path: &Path) -> Result<String, std::io::Error> {
    let content = fs::read(path)?;
    let mut hasher = Sha256::new();
    hasher.update(&content);
    Ok(hex::encode(hasher.finalize()))
}

/// Check if a directory is a skill directory (contains SKILL.md)
#[allow(dead_code)]
pub fn is_skill_directory(path: &Path) -> bool {
    path.is_dir() && path.join("SKILL.md").exists()
}

/// Check if a file is a SKILL.md file (Agent Skills standard format)
pub fn is_skill_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|s| s.to_str())
        .map(|name| name == "SKILL.md")
        .unwrap_or(false)
}

/// Parse YAML front matter from markdown content
pub fn parse_front_matter(content: &str) -> Option<SkillMetadata> {
    let lines: Vec<&str> = content.lines().collect();

    // Check for opening delimiter
    if lines.first() != Some(&"---") {
        return None;
    }

    // Need at least 3 lines: opening ---, some content, closing ---
    if lines.len() < 3 {
        return None;
    }

    // Find closing delimiter (searching from line 1 onwards)
    let end_idx = lines.iter().skip(1).position(|&line| line == "---")?;
    
    // If end_idx is 0, it means the closing --- is at lines[1], which means no content
    if end_idx == 0 {
        return None;
    }
    
    // We want lines from index 1 to end_idx (exclusive of the closing ---)
    let yaml_content = lines[1..end_idx + 1].join("\n");

    // Parse YAML
    serde_yaml::from_str(&yaml_content).ok()
}

/// Parse a SKILL.md file and return metadata
pub fn parse_skill_file(path: &Path) -> Result<SkillMetadata, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;

    // Parse as markdown with front matter
    parse_front_matter(&content)
        .ok_or_else(|| "Could not parse SKILL.md file. Make sure it has valid YAML front matter.".to_string())
}

/// Scan a skill directory and collect all resources
pub fn scan_skill_resources(skill_dir: &Path) -> SkillResources {
    let mut resources = SkillResources::default();
    
    // Define resource directories
    let scripts_dir = skill_dir.join("scripts");
    let references_dir = skill_dir.join("references");
    let assets_dir = skill_dir.join("assets");
    
    // Scan scripts directory
    if scripts_dir.exists() {
        resources.scripts = scan_directory_resources(&scripts_dir, skill_dir, "script");
    }
    
    // Scan references directory
    if references_dir.exists() {
        resources.references = scan_directory_resources(&references_dir, skill_dir, "reference");
    }
    
    // Scan assets directory
    if assets_dir.exists() {
        resources.assets = scan_directory_resources(&assets_dir, skill_dir, "asset");
    }
    
    // Scan other files in root (LICENSE.txt, *.md files except SKILL.md, etc.)
    if let Ok(entries) = fs::read_dir(skill_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                let filename = path.file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");
                
                // Skip SKILL.md (main skill file)
                if filename == "SKILL.md" {
                    continue;
                }
                
                // Include other files like LICENSE.txt, *.md reference files
                if let Ok(metadata) = fs::metadata(&path) {
                    let extension = path.extension()
                        .and_then(|s| s.to_str())
                        .map(String::from);
                    
                    resources.other.push(SkillResource {
                        name: filename.to_string(),
                        path: filename.to_string(),
                        resource_type: "other".to_string(),
                        size: metadata.len(),
                        extension,
                    });
                }
            }
        }
    }
    
    resources
}

/// Scan a directory and return all files as resources
fn scan_directory_resources(dir: &Path, skill_dir: &Path, resource_type: &str) -> Vec<SkillResource> {
    let mut resources = Vec::new();
    
    for entry in WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        
        if let Ok(metadata) = fs::metadata(path) {
            let relative_path = path.strip_prefix(skill_dir)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| path.to_string_lossy().to_string());
            
            let filename = path.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            
            let extension = path.extension()
                .and_then(|s| s.to_str())
                .map(String::from);
            
            resources.push(SkillResource {
                name: filename,
                path: relative_path,
                resource_type: resource_type.to_string(),
                size: metadata.len(),
                extension,
            });
        }
    }
    
    resources
}

/// Create a Skill struct from a skill directory.
///
/// `library_root` (optional) is used to compute the stable `skill_id` as the relative
/// directory path from the library root. If omitted, `skill_id` falls back to the
/// directory's basename.
pub fn create_skill_from_directory(
    skill_dir: &Path,
    source_url: Option<String>,
    library_root: Option<&Path>,
) -> Result<Skill, String> {
    let skill_md_path = skill_dir.join("SKILL.md");
    
    if !skill_md_path.exists() {
        return Err(format!("SKILL.md not found in {}", skill_dir.display()));
    }
    
    // Calculate hash of SKILL.md
    let hash = calculate_file_hash(&skill_md_path)
        .map_err(|e| format!("Failed to calculate hash: {}", e))?;
    
    // Parse metadata
    let metadata = parse_skill_file(&skill_md_path)?;
    
    // Scan resources
    let resources = scan_skill_resources(skill_dir);
    
    let now = chrono_now();
    let is_downloaded = source_url.is_some();
    
    // Perform risk analysis on SKILL.md and all scripts
    let risk_analysis = analyze_skill_directory(skill_dir);

    // Stable identifier: relative path from library root, normalized to forward slashes.
    let skill_id = compute_skill_id(skill_dir, library_root);
    
    Ok(Skill {
        skill_id,
        hash,
        filename: "SKILL.md".to_string(),
        local_path: skill_md_path.to_string_lossy().to_string(),
        skill_dir: skill_dir.to_string_lossy().to_string(),
        source_url,
        name: metadata.name,
        description: metadata.description,
        license: metadata.license,
        allowed_tools: metadata.allowed_tools,
        version: metadata.version,
        author: metadata.author,
        tags: metadata.tags,
        permissions: metadata.permissions,
        parameters: metadata.parameters,
        resources,
        is_downloaded,
        is_quarantined: false,
        risk_analysis,
        created_at: now.clone(),
        updated_at: now,
        category: None,
    })
}

/// Compute the stable `skill_id` as the relative directory path from `library_root`,
/// normalized to forward slashes. Falls back to the directory basename when there is
/// no library root or the skill is outside it.
pub fn compute_skill_id(skill_dir: &Path, library_root: Option<&Path>) -> String {
    if let Some(root) = library_root {
        if let Ok(rel) = skill_dir.strip_prefix(root) {
            let id = rel.to_string_lossy().replace('\\', "/");
            if !id.is_empty() {
                return id;
            }
        }
    }
    skill_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Directory names that never contain skill content; skip when walking.
pub(crate) const IGNORE_DIR_NAMES: &[&str] = &[
    ".git", ".svn", ".hg",
    "node_modules", "target", "dist", "build", "out",
    ".venv", "venv", "env", "__pycache__", ".pytest_cache",
    ".next", ".nuxt", ".cache", ".turbo",
    ".DS_Store",
];

/// Analyze risk across the whole skill directory: SKILL.md plus every file under
/// scripts/, references/, assets/, and root-level extras. Ignored directories and
/// excessively large files are skipped to keep scanning bounded.
fn analyze_skill_directory(skill_dir: &Path) -> Option<crate::types::RiskAnalysis> {
    let mut all_risks = Vec::new();
    let mut has_executable_code = false;
    let mut highest_level: Option<RiskLevel> = None;

    const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024; // skip files larger than 2MB

    for entry in WalkDir::new(skill_dir)
        .max_depth(6)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !IGNORE_DIR_NAMES.iter().any(|d| name == *d)
        })
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        // Skip oversized files (likely assets, not code)
        if let Ok(meta) = fs::metadata(path) {
            if meta.len() > MAX_FILE_BYTES {
                continue;
            }
        }

        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };

        let analysis = analyze_file(path, &content);
        if analysis.is_executable_code {
            has_executable_code = true;
        }
        for risk in analysis.detected_risks {
            update_highest_level(&mut highest_level, risk.level);
            all_risks.push(risk);
        }
    }

    if has_executable_code || !all_risks.is_empty() {
        Some(crate::types::RiskAnalysis {
            overall_level: highest_level.map(|l| match l {
                RiskLevel::Low => crate::types::RiskLevel::Low,
                RiskLevel::Medium => crate::types::RiskLevel::Medium,
                RiskLevel::High => crate::types::RiskLevel::High,
            }),
            detected_risks: all_risks.into_iter().map(|r| {
                crate::types::DetectedRisk {
                    category: r.category,
                    description: r.description,
                    level: match r.level {
                        RiskLevel::Low => crate::types::RiskLevel::Low,
                        RiskLevel::Medium => crate::types::RiskLevel::Medium,
                        RiskLevel::High => crate::types::RiskLevel::High,
                    },
                    line: r.line,
                    pattern: r.pattern,
                }
            }).collect(),
            is_executable_code: has_executable_code,
            file_extension: Some("md".to_string()),
        })
    } else {
        None
    }
}

fn update_highest_level(current: &mut Option<RiskLevel>, new: RiskLevel) {
    match (&*current, new) {
        (None, level) => *current = Some(level),
        (Some(RiskLevel::Low), RiskLevel::Medium) => *current = Some(RiskLevel::Medium),
        (Some(RiskLevel::Low), RiskLevel::High) => *current = Some(RiskLevel::High),
        (Some(RiskLevel::Medium), RiskLevel::High) => *current = Some(RiskLevel::High),
        _ => {}
    }
}

/// Current time as RFC 3339 / ISO 8601 UTC string, backed by `chrono`.
fn chrono_now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_front_matter() {
        let content = r#"---
name: test-skill
description: A test skill for testing purposes
license: MIT
---

# Test Skill
"#;

        let result = parse_front_matter(content);
        assert!(result.is_some());

        let metadata = result.unwrap();
        assert_eq!(metadata.name, "test-skill");
        assert_eq!(metadata.description, "A test skill for testing purposes");
        assert_eq!(metadata.license, Some("MIT".to_string()));
    }

    #[test]
    fn test_no_front_matter() {
        let content = "# No front matter";
        let result = parse_front_matter(content);
        assert!(result.is_none());
    }
    
    #[test]
    fn test_is_skill_directory() {
        // This test would need a temp directory setup
        // For now, just test the function exists
        let path = Path::new("/nonexistent");
        assert!(!is_skill_directory(path));
    }

    #[test]
    fn test_compute_skill_id_basename_when_no_root() {
        let id = compute_skill_id(Path::new("/tmp/lib/web-search"), None);
        assert_eq!(id, "web-search");
    }

    #[test]
    fn test_compute_skill_id_relative_path() {
        let root = Path::new("/tmp/lib");
        let id = compute_skill_id(Path::new("/tmp/lib/web-search"), Some(root));
        assert_eq!(id, "web-search");
    }

    #[test]
    fn test_compute_skill_id_nested_relative_path() {
        // Nested skills should produce "category/name", not just "name".
        // This is what protects two skills with the same dir name in different categories
        // from colliding on the same database row.
        let root = Path::new("/tmp/lib");
        let id = compute_skill_id(Path::new("/tmp/lib/research/web-search"), Some(root));
        assert_eq!(id, "research/web-search");
    }

    #[test]
    fn test_compute_skill_id_outside_root_falls_back_to_basename() {
        let root = Path::new("/tmp/lib");
        let id = compute_skill_id(Path::new("/elsewhere/web-search"), Some(root));
        assert_eq!(id, "web-search");
    }

    #[test]
    fn test_parse_allowed_tools_as_string() {
        // Per Agent Skills spec, allowed-tools is a space-separated string.
        let content = r#"---
name: tools-string
description: test
allowed-tools: Bash Read Write
---
"#;
        let m = parse_front_matter(content).unwrap();
        assert_eq!(m.allowed_tools, vec!["Bash", "Read", "Write"]);
    }

    #[test]
    fn test_parse_allowed_tools_as_array() {
        // We also accept the legacy/community list form.
        let content = r#"---
name: tools-array
description: test
allowed-tools:
  - Bash
  - Read
---
"#;
        let m = parse_front_matter(content).unwrap();
        assert_eq!(m.allowed_tools, vec!["Bash", "Read"]);
    }

    #[test]
    fn test_parse_compatibility_field() {
        let content = r#"---
name: compat
description: test
compatibility: Requires Python 3.14+ and uv
---
"#;
        let m = parse_front_matter(content).unwrap();
        assert_eq!(
            m.compatibility,
            Some("Requires Python 3.14+ and uv".to_string())
        );
    }
}
