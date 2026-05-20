use std::fs;
use std::path::Path;

#[cfg(unix)]
use std::os::unix::fs::symlink;

/// Sync symlinks in a space's active directory.
///
/// Each entry in `enabled_skill_dirs` must be the absolute path to a skill *directory*
/// (i.e. the folder that contains SKILL.md), not the path to SKILL.md itself.
/// The active directory is wiped of existing symlinks, then one symlink per skill
/// is created pointing at the source directory. This matches the Agent Skills
/// specification, where a skill is a directory unit.
pub fn sync_space_links(
    _library_path: &Path,
    active_path: &Path,
    enabled_skill_dirs: &[String],
) -> Result<SyncResult, String> {
    // 1. Ensure active directory exists
    if !active_path.exists() {
        fs::create_dir_all(active_path).map_err(|e| e.to_string())?;
    }

    // 2. Clean old symlinks
    clean_old_links(active_path)?;

    // 3. Create new symlinks
    let mut created = 0;
    let mut failed = Vec::new();

    for skill_dir_path in enabled_skill_dirs {
        let src = Path::new(skill_dir_path);

        if !src.exists() {
            failed.push((skill_dir_path.clone(), "Source directory not found".to_string()));
            continue;
        }
        if !src.is_dir() {
            failed.push((skill_dir_path.clone(), "Source path is not a directory".to_string()));
            continue;
        }

        // Use the directory name as the link name in the active directory.
        let dirname = match src.file_name().map(|s| s.to_string_lossy().to_string()) {
            Some(name) if !name.is_empty() => name,
            _ => {
                failed.push((skill_dir_path.clone(), "Cannot determine directory name".to_string()));
                continue;
            }
        };
        let dst = active_path.join(&dirname);

        match create_symlink(src, &dst) {
            Ok(_) => created += 1,
            Err(e) => failed.push((dirname, e)),
        }
    }

    Ok(SyncResult { created, failed })
}

/// Remove all symlinks from a directory
fn clean_old_links(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        // Only remove symlinks
        if path.is_symlink() {
            // remove_file works for both file and directory symlinks on Unix.
            // On Windows, directory symlinks need remove_dir; try both.
            #[cfg(windows)]
            {
                if path.metadata().map(|m| m.is_dir()).unwrap_or(false) {
                    fs::remove_dir(&path).map_err(|e| e.to_string())?;
                    continue;
                }
            }
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[cfg(unix)]
pub fn create_symlink(src: &Path, dst: &Path) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Remove existing file/link if present
    if dst.exists() || dst.is_symlink() {
        if dst.is_symlink() {
            fs::remove_file(dst).map_err(|e| e.to_string())?;
        } else if dst.is_dir() {
            return Err(format!(
                "Destination {} already exists as a real directory; refusing to overwrite",
                dst.display()
            ));
        } else {
            fs::remove_file(dst).map_err(|e| e.to_string())?;
        }
    }

    symlink(src, dst).map_err(|e| e.to_string())
}

#[cfg(windows)]
pub fn create_symlink(src: &Path, dst: &Path) -> Result<(), String> {
    use std::os::windows::fs::{symlink_dir, symlink_file};

    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    if dst.exists() || dst.is_symlink() {
        if dst.is_symlink() && dst.metadata().map(|m| m.is_dir()).unwrap_or(false) {
            fs::remove_dir(dst).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(dst).map_err(|e| e.to_string())?;
        }
    }

    if src.is_dir() {
        symlink_dir(src, dst).map_err(|e| e.to_string())
    } else {
        symlink_file(src, dst).map_err(|e| e.to_string())
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SyncResult {
    pub created: usize,
    pub failed: Vec<(String, String)>,
}
