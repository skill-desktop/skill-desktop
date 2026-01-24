use std::fs;
use std::path::Path;

#[cfg(unix)]
use std::os::unix::fs::symlink;

/// Sync symlinks in a space's active directory
/// 
/// # Arguments
/// * `library_path` - The root library directory path
/// * `active_path` - The space's active directory where symlinks will be created
/// * `enabled_skill_paths` - Full paths to the skill files to be linked
pub fn sync_space_links(
    _library_path: &Path,
    active_path: &Path,
    enabled_skill_paths: &[String],
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

    for skill_path in enabled_skill_paths {
        let src = Path::new(skill_path);
        
        // Get just the filename for the destination
        let filename = src
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| skill_path.clone());
        let dst = active_path.join(&filename);

        if !src.exists() {
            failed.push((filename, "Source file not found".to_string()));
            continue;
        }

        match create_symlink(src, &dst) {
            Ok(_) => created += 1,
            Err(e) => failed.push((filename, e)),
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
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[cfg(unix)]
fn create_symlink(src: &Path, dst: &Path) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Remove existing file/link if present
    if dst.exists() || dst.is_symlink() {
        fs::remove_file(dst).map_err(|e| e.to_string())?;
    }

    symlink(src, dst).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn create_symlink(src: &Path, dst: &Path) -> Result<(), String> {
    use std::os::windows::fs::symlink_file;

    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    if dst.exists() || dst.is_symlink() {
        fs::remove_file(dst).map_err(|e| e.to_string())?;
    }

    symlink_file(src, dst).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SyncResult {
    pub created: usize,
    pub failed: Vec<(String, String)>,
}
