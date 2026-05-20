use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager, State};
use walkdir::WalkDir;

use crate::scanner::{create_skill_from_directory, is_skill_file};
use crate::space::{sync_space_links, SyncResult};
use crate::types::{Skill, SkillMetadata, Space};
use crate::{DatabaseState, WatcherState};

// ========== Default Paths Command ==========

/// Default paths for different platforms
/// Following the conventions of Claude Code (~/.config/claude/), OpenCode (~/.config/opencode/), etc.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultPaths {
    /// Default skill library path
    pub skill_library_path: String,
    /// Config directory path
    pub config_path: String,
    /// Data directory path
    pub data_path: String,
    /// Operating system name
    pub os_name: String,
}

/// Default paths shown in the UI ("Use Default" button).
///
/// Skill library defaults to ~/.agents/skills/ (the cross-tool Agent Skills convention),
/// falling back to the sandboxed app data directory only if $HOME is unavailable.
#[tauri::command]
pub fn get_default_paths(app_handle: AppHandle) -> Result<DefaultPaths, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let data_path = app_data_dir.join("data");
    let config_path = app_data_dir.join("config");

    let skill_path = dirs::home_dir()
        .map(|h| h.join(".agents").join("skills"))
        .unwrap_or_else(|| data_path.join("skills"));

    let os_name = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    };

    Ok(DefaultPaths {
        skill_library_path: skill_path.to_string_lossy().to_string(),
        config_path: config_path.to_string_lossy().to_string(),
        data_path: data_path.to_string_lossy().to_string(),
        os_name: os_name.to_string(),
    })
}

/// Ensure the default skill directory exists and return the path.
/// Uses the same default resolution as `get_default_paths` (prefers ~/.agents/skills/).
#[tauri::command]
pub fn ensure_default_skill_path(app_handle: AppHandle) -> Result<String, String> {
    let paths = get_default_paths(app_handle)?;
    let skill_path = PathBuf::from(&paths.skill_library_path);

    if !skill_path.exists() {
        std::fs::create_dir_all(&skill_path)
            .map_err(|e| format!("Failed to create skill directory: {}", e))?;
    }

    Ok(paths.skill_library_path)
}

/// State for library path
pub struct LibraryState {
    pub path: std::sync::Mutex<Option<PathBuf>>,
}

/// Get all skills from the library directory
/// Scans for skill directories containing SKILL.md files
#[tauri::command]
pub async fn get_all_skills(
    library_state: State<'_, LibraryState>,
    db_state: State<'_, DatabaseState>,
) -> Result<Vec<Skill>, String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };

    let Some(library_path) = library_path else {
        return Ok(vec![]);
    };

    let mut skills = get_all_skills_internal(&library_path)?;

    // Enrich with categories: prefer skill_id (stable) over skill_hash (changes on edit).
    let categories_by_id = db_state.0.get_skill_categories_by_id().unwrap_or_default();
    let categories_by_hash = db_state.0.get_skill_categories().unwrap_or_default();
    for skill in &mut skills {
        if let Some(cat) = categories_by_id.get(&skill.skill_id) {
            skill.category = Some(cat.clone());
        } else if let Some(cat) = categories_by_hash.get(&skill.hash) {
            skill.category = Some(cat.clone());
        }
    }

    Ok(skills)
}

/// Set skill category. Persists both legacy `skill_hash` and the stable `skill_id`
/// so the assignment survives future SKILL.md edits.
#[tauri::command]
pub async fn set_skill_category(
    hash: String,
    category: String,
    library_state: State<'_, LibraryState>,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    let skill_id = resolve_skill_id_from_hash(&hash, &library_state).ok();
    db_state.0.set_skill_category_full(&hash, skill_id.as_deref(), &category)?;
    Ok(())
}

/// Search skills by query
#[tauri::command]
pub async fn search_skills(
    query: String,
    library_state: State<'_, LibraryState>,
    db_state: State<'_, DatabaseState>,
) -> Result<Vec<Skill>, String> {
    let all_skills = get_all_skills(library_state, db_state).await?;

    let query = query.to_lowercase();
    let filtered: Vec<Skill> = all_skills
        .into_iter()
        .filter(|skill| {
            skill.name.to_lowercase().contains(&query)
                || skill.description.to_lowercase().contains(&query)
                || skill.tags.iter().any(|t| t.to_lowercase().contains(&query))
                || skill.category.as_ref().map_or(false, |c| c.to_lowercase().contains(&query))
        })
        .collect();

    Ok(filtered)
}

/// Get skill content by hash
#[tauri::command]
pub async fn get_skill_content(
    hash: String,
    library_state: State<'_, LibraryState>,
    db_state: State<'_, DatabaseState>,
) -> Result<String, String> {
    let all_skills = get_all_skills(library_state, db_state).await?;

    let skill = all_skills
        .into_iter()
        .find(|s| s.hash == hash)
        .ok_or("Skill not found")?;

    std::fs::read_to_string(&skill.local_path).map_err(|e| e.to_string())
}

/// Set library path
#[tauri::command]
pub async fn set_library_path(
    path: String,
    library_state: State<'_, LibraryState>,
    db_state: State<'_, DatabaseState>,
    watcher_state: State<'_, WatcherState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        std::fs::create_dir_all(&path_buf).map_err(|e| e.to_string())?;
    }

    // Update in-memory state
    {
        let mut guard = library_state.path.lock().map_err(|e| e.to_string())?;
        *guard = Some(path_buf.clone());
    }

    // Persist to database
    db_state.0.set_setting("library_path", &path)?;

    // Update file watcher
    {
        let mut watcher = watcher_state.0.lock().map_err(|e| e.to_string())?;
        watcher.stop();
        if let Err(e) = watcher.watch(path_buf, app_handle) {
            tracing::error!("Failed to start file watcher: {}", e);
        }
    }

    Ok(())
}

/// Get current library path
#[tauri::command]
pub async fn get_library_path(library_state: State<'_, LibraryState>) -> Result<String, String> {
    let guard = library_state.path.lock().map_err(|e| e.to_string())?;
    Ok(guard
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default())
}

/// Rescan library directory
#[tauri::command]
pub async fn rescan_library(
    library_state: State<'_, LibraryState>,
    db_state: State<'_, DatabaseState>,
) -> Result<usize, String> {
    let skills = get_all_skills(library_state, db_state).await?;
    Ok(skills.len())
}

/// State for spaces (in-memory storage for now)
pub struct SpacesState {
    pub spaces: std::sync::Mutex<Vec<Space>>,
}

impl Default for SpacesState {
    fn default() -> Self {
        let now = chrono_now();
        Self {
            spaces: std::sync::Mutex::new(vec![Space {
                id: "default".to_string(),
                name: "Default".to_string(),
                active_dir_path: "".to_string(),
                description: Some("Default workspace".to_string()),
                is_default: true,
                created_at: now.clone(),
                updated_at: now,
            }]),
        }
    }
}

/// State for space-skill visibility mappings
pub struct VisibilityState {
    /// Map of space_id -> set of visible skill hashes
    pub mappings: std::sync::Mutex<std::collections::HashMap<String, std::collections::HashSet<String>>>,
}

impl Default for VisibilityState {
    fn default() -> Self {
        Self {
            mappings: std::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }
}

/// Current time as RFC 3339 / ISO 8601 UTC string ("2026-05-20T14:23:11Z").
/// Backed by `chrono` — replaces an old hand-rolled date algorithm that was easy to get wrong.
fn chrono_now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// Get all spaces
#[tauri::command]
pub async fn get_all_spaces(spaces_state: State<'_, SpacesState>) -> Result<Vec<Space>, String> {
    let guard = spaces_state.spaces.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

/// Create a new space
#[tauri::command]
pub async fn create_space(
    name: String,
    active_dir: String,
    description: Option<String>,
    spaces_state: State<'_, SpacesState>,
    db_state: State<'_, DatabaseState>,
) -> Result<Space, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono_now();

    // Create the active directory if it doesn't exist
    let active_path = PathBuf::from(&active_dir);
    if !active_path.exists() {
        std::fs::create_dir_all(&active_path).map_err(|e| e.to_string())?;
    }

    let space = Space {
        id,
        name,
        active_dir_path: active_dir,
        description,
        is_default: false,
        created_at: now.clone(),
        updated_at: now,
    };

    // Persist to database
    db_state.0.create_space(&space)?;

    // Update in-memory state
    let mut guard = spaces_state.spaces.lock().map_err(|e| e.to_string())?;
    guard.push(space.clone());

    Ok(space)
}

/// Update an existing space
#[tauri::command]
pub async fn update_space(
    id: String,
    name: Option<String>,
    active_dir: Option<String>,
    description: Option<String>,
    spaces_state: State<'_, SpacesState>,
    db_state: State<'_, DatabaseState>,
) -> Result<Space, String> {
    // First, get the current space and prepare the updated version
    let updated_space = {
        let guard = spaces_state.spaces.lock().map_err(|e| e.to_string())?;
        
        let space = guard
            .iter()
            .find(|s| s.id == id)
            .ok_or("Space not found")?;

        let mut updated = space.clone();
        
        if let Some(n) = name {
            updated.name = n;
        }
        if let Some(dir) = &active_dir {
            // Create the directory if it doesn't exist
            let path = PathBuf::from(dir);
            if !path.exists() {
                std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            }
            updated.active_dir_path = dir.clone();
        }
        if description.is_some() {
            updated.description = description;
        }
        updated.updated_at = chrono_now();
        
        updated
    };

    // Persist to database first
    db_state.0.update_space(&updated_space)?;

    // Then update in-memory state
    {
        let mut guard = spaces_state.spaces.lock().map_err(|e| e.to_string())?;
        if let Some(space) = guard.iter_mut().find(|s| s.id == id) {
            *space = updated_space.clone();
        }
    }

    Ok(updated_space)
}

/// Delete a space
#[tauri::command]
pub async fn delete_space(
    id: String,
    spaces_state: State<'_, SpacesState>,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    // First, check if space exists and is not default (without modifying state)
    {
        let guard = spaces_state.spaces.lock().map_err(|e| e.to_string())?;
        
        let space = guard.iter().find(|s| s.id == id);
        match space {
            None => return Err("Space not found".to_string()),
            Some(s) if s.is_default => return Err("Cannot delete the default space".to_string()),
            _ => {}
        }
    }

    // Persist to database first (if this fails, memory state is unchanged)
    db_state.0.delete_space(&id)?;

    // Then update in-memory state
    {
        let mut guard = spaces_state.spaces.lock().map_err(|e| e.to_string())?;
        guard.retain(|s| s.id != id);
    }

    Ok(())
}

/// Get a single space by ID
#[tauri::command]
pub async fn get_space(
    id: String,
    spaces_state: State<'_, SpacesState>,
) -> Result<Space, String> {
    let guard = spaces_state.spaces.lock().map_err(|e| e.to_string())?;
    guard
        .iter()
        .find(|s| s.id == id)
        .cloned()
        .ok_or("Space not found".to_string())
}

/// Sync space symlinks
#[tauri::command]
pub async fn sync_space(
    library_path: String,
    active_path: String,
    enabled_skills: Vec<String>,
) -> Result<SyncResult, String> {
    let lib_path = PathBuf::from(library_path);
    let act_path = PathBuf::from(active_path);

    sync_space_links(&lib_path, &act_path, &enabled_skills)
}

/// Delete a skill: removes the entire skill directory (SKILL.md + scripts/ + references/ + assets/).
/// The skill directory must reside under the library path; we refuse to delete anything outside.
///
/// Also cleans up any installation records pointing at this skill so the database
/// doesn't end up with orphan rows (and any dangling symlinks in AI tool directories
/// are removed best-effort).
#[tauri::command]
pub async fn delete_skill(
    hash: String,
    library_state: State<'_, LibraryState>,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    let all_skills = get_all_skills_internal(&library_path)?;

    let skill = all_skills
        .into_iter()
        .find(|s| s.hash == hash)
        .ok_or("Skill not found")?;

    let skill_id = skill.skill_id.clone();
    delete_skill_directory(&PathBuf::from(&skill.skill_dir), &library_path)?;
    cleanup_skill_installations(&db_state, &skill_id);
    Ok(())
}

/// Delete multiple skills, each as the entire skill directory.
#[tauri::command]
pub async fn delete_skills_batch(
    hashes: Vec<String>,
    library_state: State<'_, LibraryState>,
    db_state: State<'_, DatabaseState>,
) -> Result<BatchDeleteResult, String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    let all_skills = get_all_skills_internal(&library_path)?;

    let mut deleted = 0;
    let mut failed: Vec<(String, String)> = Vec::new();

    for hash in hashes {
        if let Some(skill) = all_skills.iter().find(|s| s.hash == hash) {
            match delete_skill_directory(&PathBuf::from(&skill.skill_dir), &library_path) {
                Ok(_) => {
                    deleted += 1;
                    cleanup_skill_installations(&db_state, &skill.skill_id);
                }
                Err(e) => failed.push((skill.name.clone(), e)),
            }
        } else {
            failed.push((hash, "Skill not found".to_string()));
        }
    }

    Ok(BatchDeleteResult { deleted, failed })
}

/// Best-effort cleanup of installation records and dangling symlinks for a deleted skill.
/// Failures here are logged but never bubbled up — the actual skill deletion has already
/// succeeded by this point and we don't want to surface a confusing error to the user.
fn cleanup_skill_installations(db_state: &State<'_, DatabaseState>, skill_id: &str) {
    let installations = match db_state.0.list_installations_for_skill(skill_id) {
        Ok(rows) => rows,
        Err(e) => {
            tracing::warn!("Could not list installations for {}: {}", skill_id, e);
            return;
        }
    };

    for inst in installations {
        let linked = std::path::PathBuf::from(&inst.linked_path);
        // Only ever remove links — never real directories. If it's not a symlink we
        // leave it alone (it might be a user file that happens to share the name).
        if linked.is_symlink() {
            #[cfg(windows)]
            {
                if linked.metadata().map(|m| m.is_dir()).unwrap_or(false) {
                    let _ = std::fs::remove_dir(&linked);
                } else {
                    let _ = std::fs::remove_file(&linked);
                }
            }
            #[cfg(unix)]
            {
                let _ = std::fs::remove_file(&linked);
            }
        }
        if let Err(e) = db_state.0.remove_installation(skill_id, &inst.target_path) {
            tracing::warn!("Could not remove install record {}: {}", inst.target_path, e);
        }
    }
}

/// Helper: delete a skill directory, but only if it is a strict descendant of the library root.
/// This prevents accidental deletion of arbitrary paths.
fn delete_skill_directory(skill_dir: &PathBuf, library_path: &PathBuf) -> Result<(), String> {
    if !skill_dir.exists() {
        return Err(format!("Skill directory does not exist: {}", skill_dir.display()));
    }

    // Canonicalize both paths so symlinks/relative segments don't fool the safety check.
    let canon_skill = std::fs::canonicalize(skill_dir)
        .map_err(|e| format!("Failed to resolve skill directory: {}", e))?;
    let canon_library = std::fs::canonicalize(library_path)
        .map_err(|e| format!("Failed to resolve library directory: {}", e))?;

    if !canon_skill.starts_with(&canon_library) {
        return Err(format!(
            "Refusing to delete {}: not inside library {}",
            canon_skill.display(),
            canon_library.display()
        ));
    }

    if canon_skill == canon_library {
        return Err("Refusing to delete the library root itself".to_string());
    }

    std::fs::remove_dir_all(&canon_skill).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDeleteResult {
    pub deleted: usize,
    pub failed: Vec<(String, String)>,
}

/// Quarantine state for skills (cached in memory, persisted to database)
pub struct QuarantineState {
    pub quarantined: std::sync::Mutex<std::collections::HashSet<String>>,
}

impl Default for QuarantineState {
    fn default() -> Self {
        Self {
            quarantined: std::sync::Mutex::new(std::collections::HashSet::new()),
        }
    }
}

/// Set quarantine status for a skill.
/// Persists both `skill_hash` (legacy) and `skill_id` (stable) so the setting survives
/// future edits to SKILL.md.
#[tauri::command]
pub async fn set_skill_quarantine(
    hash: String,
    is_quarantined: bool,
    library_state: State<'_, LibraryState>,
    quarantine_state: State<'_, QuarantineState>,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    let skill_id = resolve_skill_id_from_hash(&hash, &library_state).ok();

    db_state.0.set_skill_quarantine_full(&hash, skill_id.as_deref(), is_quarantined)?;

    let mut quarantined = quarantine_state.quarantined.lock().map_err(|e| e.to_string())?;
    if is_quarantined {
        quarantined.insert(hash);
    } else {
        quarantined.remove(&hash);
    }

    Ok(())
}

/// Get the set of quarantined skill hashes for the current library.
/// Includes both legacy `skill_hash` entries and entries that have been migrated to
/// `skill_id` (we resolve `skill_id` back to the current hash via the library scan).
#[tauri::command]
pub async fn get_quarantined_skills(
    library_state: State<'_, LibraryState>,
    quarantine_state: State<'_, QuarantineState>,
    db_state: State<'_, DatabaseState>,
) -> Result<Vec<String>, String> {
    let mut hashes: std::collections::HashSet<String> =
        db_state.0.get_quarantined_skills()?.into_iter().collect();

    // Map quarantined skill_ids back to current hashes.
    let ids = db_state.0.get_quarantined_skill_ids().unwrap_or_default();
    if !ids.is_empty() {
        if let Some(library_path) = {
            let guard = library_state.path.lock().map_err(|e| e.to_string())?;
            guard.clone()
        } {
            if let Ok(skills) = get_all_skills_internal(&library_path) {
                let id_set: std::collections::HashSet<_> = ids.into_iter().collect();
                for s in &skills {
                    if id_set.contains(&s.skill_id) {
                        hashes.insert(s.hash.clone());
                    }
                }
            }
        }
    }

    let out: Vec<String> = hashes.into_iter().collect();

    let mut cache = quarantine_state.quarantined.lock().map_err(|e| e.to_string())?;
    *cache = out.iter().cloned().collect();

    Ok(out)
}

/// Resolve a skill's `skill_id` given its content hash. Returns Err if not found.
fn resolve_skill_id_from_hash(
    hash: &str,
    library_state: &State<'_, LibraryState>,
) -> Result<String, String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };
    let all = get_all_skills_internal(&library_path)?;
    all.into_iter()
        .find(|s| s.hash == hash)
        .map(|s| s.skill_id)
        .ok_or_else(|| format!("Skill with hash {} not found", hash))
}

/// Show file in system file manager (Finder on macOS)
#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);

    if !path.exists() {
        return Err("File not found".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        // Try xdg-open on the parent directory
        if let Some(parent) = path.parent() {
            Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// Open a file with the default application
#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);

    if !path.exists() {
        return Err("File not found".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Preview skill from URL (fetch and parse without saving)
#[tauri::command]
pub async fn preview_skill_from_url(url: String) -> Result<SkillPreview, String> {
    // Fetch content from URL
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Parse metadata from content
    let metadata = crate::scanner::parse_front_matter(&content)
        .ok_or("Failed to parse skill metadata. Make sure the file has valid YAML front matter.")?;

    // Perform risk analysis based on URL extension
    let extension = url.rsplit('.').next();
    let risk_analysis = analyze_content_risk(&content, extension);

    Ok(SkillPreview {
        metadata,
        content,
        source_url: url,
        risk_analysis,
    })
}

/// Helper function to analyze content risk
fn analyze_content_risk(content: &str, extension: Option<&str>) -> Option<crate::types::RiskAnalysis> {
    let analysis = crate::scanner::analyze_content(content, extension);
    
    if analysis.is_executable_code || !analysis.detected_risks.is_empty() {
        Some(crate::types::RiskAnalysis {
            overall_level: analysis.overall_level.map(|l| match l {
                crate::scanner::RiskLevel::Low => crate::types::RiskLevel::Low,
                crate::scanner::RiskLevel::Medium => crate::types::RiskLevel::Medium,
                crate::scanner::RiskLevel::High => crate::types::RiskLevel::High,
            }),
            detected_risks: analysis.detected_risks.into_iter().map(|r| {
                crate::types::DetectedRisk {
                    category: r.category,
                    description: r.description,
                    level: match r.level {
                        crate::scanner::RiskLevel::Low => crate::types::RiskLevel::Low,
                        crate::scanner::RiskLevel::Medium => crate::types::RiskLevel::Medium,
                        crate::scanner::RiskLevel::High => crate::types::RiskLevel::High,
                    },
                    line: r.line,
                    pattern: r.pattern,
                }
            }).collect(),
            is_executable_code: analysis.is_executable_code,
            file_extension: analysis.file_extension,
        })
    } else {
        None
    }
}

/// Import skill from URL to library
/// Creates a skill directory with SKILL.md file
#[tauri::command]
pub async fn import_skill_from_url(
    url: String,
    library_state: State<'_, LibraryState>,
) -> Result<Skill, String> {
    // Get library path
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    // Fetch content from URL
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Parse metadata
    let metadata = crate::scanner::parse_front_matter(&content)
        .ok_or("Failed to parse skill metadata")?;

    // Sanitize the upstream name to defend against path traversal and invalid chars.
    let safe_name = sanitize_skill_name(&metadata.name)?;

    // Create skill directory
    let skill_dir = library_path.join(&safe_name);
    if skill_dir.exists() {
        return Err(format!("A skill with name '{}' already exists", safe_name));
    }

    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;

    // Patch the frontmatter so the on-disk `name:` matches the sanitized directory.
    // Falling back to the raw content keeps imports working even if the upstream
    // file has odd frontmatter that we couldn't round-trip through serde_yaml.
    let final_content =
        rewrite_skill_md_name(&content, &safe_name).unwrap_or_else(|_| content.clone());
    let skill_md_path = skill_dir.join("SKILL.md");
    std::fs::write(&skill_md_path, &final_content)
        .map_err(|e| format!("Failed to write SKILL.md: {}", e))?;

    create_skill_from_directory(&skill_dir, Some(url), Some(&library_path))
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPreview {
    pub metadata: SkillMetadata,
    pub content: String,
    pub source_url: String,
    /// Risk analysis for the content
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_analysis: Option<crate::types::RiskAnalysis>,
}

/// Export configuration for Claude Desktop
#[tauri::command]
pub async fn export_claude_config(
    space_id: String,
    library_state: State<'_, LibraryState>,
    spaces_state: State<'_, SpacesState>,
    db_state: State<'_, DatabaseState>,
) -> Result<String, String> {
    // Get library path
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    // Verify space exists
    {
        let guard = spaces_state.spaces.lock().map_err(|e| e.to_string())?;
        if !guard.iter().any(|s| s.id == space_id) {
            return Err("Space not found".to_string());
        }
    }

    // Get all skills, filtered to those visible in this space.
    let all_skills = get_all_skills_internal(&library_path)?;
    let skills = filter_visible_skills(&db_state, &space_id, all_skills);

    // Claude Code / Claude Desktop discovers skills by scanning ~/.claude/skills/<name>/.
    // Each skill directory must contain SKILL.md and may contain scripts/ references/ assets/.
    // We don't try to "export" a config file here — Claude has no skill config schema.
    // Instead we **install** each visible skill into ~/.claude/skills/ via a symbolic link
    // (the same mechanism as `install_skill_to_tool` but in bulk for this space).
    let target_path = InstallTargetKind::Claude
        .default_path()
        .ok_or("Cannot determine home directory")?;

    std::fs::create_dir_all(&target_path)
        .map_err(|e| format!("Failed to create Claude skills directory: {}", e))?;

    let mut installed = Vec::new();
    let mut skipped = Vec::new();

    for skill in skills {
        let skill_dir = PathBuf::from(&skill.skill_dir);
        if !skill_dir.is_dir() {
            skipped.push(format!("{}: missing on disk", skill.name));
            continue;
        }
        let link_name = match skill_dir.file_name().map(|s| s.to_string_lossy().to_string()) {
            Some(n) if !n.is_empty() => n,
            _ => {
                skipped.push(format!("{}: cannot determine link name", skill.name));
                continue;
            }
        };
        let linked_path = target_path.join(&link_name);
        match crate::space::create_symlink(&skill_dir, &linked_path) {
            Ok(_) => {
                let _ = db_state.0.record_installation(
                    &skill.skill_id,
                    InstallTargetKind::Claude.as_str(),
                    &target_path.to_string_lossy(),
                    &linked_path.to_string_lossy(),
                );
                installed.push(linked_path.to_string_lossy().to_string());
            }
            Err(e) => skipped.push(format!("{}: {}", skill.name, e)),
        }
    }

    // Return a human-readable report. The frontend dialog already shows the JSON,
    // so a structured summary is fine here.
    let report = serde_json::json!({
        "target_path": target_path.to_string_lossy().to_string(),
        "installed_count": installed.len(),
        "installed": installed,
        "skipped": skipped,
        "note": "Skills are installed as symlinks into Claude's skills directory. Restart Claude to pick them up.",
    });

    serde_json::to_string_pretty(&report).map_err(|e| e.to_string())
}

/// Export configuration as generic JSON
#[tauri::command]
pub async fn export_generic_config(
    space_id: String,
    library_state: State<'_, LibraryState>,
    spaces_state: State<'_, SpacesState>,
    db_state: State<'_, DatabaseState>,
) -> Result<String, String> {
    // Get library path
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    // Get space
    let space = {
        let guard = spaces_state.spaces.lock().map_err(|e| e.to_string())?;
        guard
            .iter()
            .find(|s| s.id == space_id)
            .cloned()
            .ok_or("Space not found")?
    };

    // Get all skills, filtered to those visible in this space.
    let all_skills = get_all_skills_internal(&library_path)?;
    let skills = filter_visible_skills(&db_state, &space_id, all_skills);

    let config = serde_json::json!({
        "space": {
            "id": space.id,
            "name": space.name,
            "description": space.description,
            "activeDirPath": space.active_dir_path
        },
        "skills": skills.iter().map(|s| serde_json::json!({
            "name": s.name,
            "version": s.version,
            "description": s.description,
            "author": s.author,
            "tags": s.tags,
            "permissions": s.permissions,
            "localPath": s.local_path
        })).collect::<Vec<_>>(),
        "exportedAt": chrono_now()
    });

    serde_json::to_string_pretty(&config).map_err(|e| e.to_string())
}

/// Export configuration as MCP-compatible format
#[tauri::command]
pub async fn export_mcp_config(
    space_id: String,
    library_state: State<'_, LibraryState>,
    spaces_state: State<'_, SpacesState>,
    db_state: State<'_, DatabaseState>,
) -> Result<String, String> {
    // Get library path
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    // Get space
    let space = {
        let guard = spaces_state.spaces.lock().map_err(|e| e.to_string())?;
        guard
            .iter()
            .find(|s| s.id == space_id)
            .cloned()
            .ok_or("Space not found")?
    };

    // Get all skills, filtered to those visible in this space.
    let all_skills = get_all_skills_internal(&library_path)?;
    let skills = filter_visible_skills(&db_state, &space_id, all_skills);

    // Build MCP-compatible tools array
    let tools: Vec<serde_json::Value> = skills.iter().map(|s| {
        // Convert parameters to JSON Schema format
        let properties: serde_json::Map<String, serde_json::Value> = s.parameters.iter().map(|p| {
            let prop = serde_json::json!({
                "type": p.param_type,
                "description": p.description
            });
            (p.name.clone(), prop)
        }).collect();
        
        let required: Vec<String> = s.parameters.iter()
            .filter(|p| p.required)
            .map(|p| p.name.clone())
            .collect();

        serde_json::json!({
            "name": s.name,
            "description": s.description,
            "inputSchema": {
                "type": "object",
                "properties": properties,
                "required": required
            }
        })
    }).collect();

    let config = serde_json::json!({
        "protocolVersion": "2024-11-05",
        "serverInfo": {
            "name": format!("skill-desktop-{}", space.name),
            "version": "1.0.0"
        },
        "capabilities": {
            "tools": {}
        },
        "tools": tools,
        "exportedAt": chrono_now()
    });

    serde_json::to_string_pretty(&config).map_err(|e| e.to_string())
}

/// Scan the library for skill directories.
///
/// Bounded walk per the Agent Skills spec recommendations:
///   - max depth 6 levels
///   - skip common build/cache/VCS directories
///   - follow symlinks (so installed skills via symlink show up)
fn get_all_skills_internal(library_path: &PathBuf) -> Result<Vec<Skill>, String> {
    if !library_path.exists() {
        return Ok(vec![]);
    }

    let mut skills = Vec::new();
    let mut visited_dirs = std::collections::HashSet::new();

    const MAX_DEPTH: usize = 6;

    for entry in WalkDir::new(library_path)
        .follow_links(true)
        .max_depth(MAX_DEPTH)
        .into_iter()
        .filter_entry(|e| {
            // Always allow the root entry itself
            if e.depth() == 0 {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            !crate::scanner::IGNORE_DIR_NAMES
                .iter()
                .any(|d| name == *d)
        })
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        // Check if this is a SKILL.md file
        if path.is_file() && is_skill_file(path) {
            // Get the parent directory (skill directory)
            if let Some(skill_dir) = path.parent() {
                // Skip if we've already processed this directory
                let dir_str = skill_dir.to_string_lossy().to_string();
                if visited_dirs.contains(&dir_str) {
                    continue;
                }
                visited_dirs.insert(dir_str);
                
                // Create skill from directory
                match create_skill_from_directory(skill_dir, None, Some(library_path.as_path())) {
                    Ok(skill) => skills.push(skill),
                    Err(e) => {
                        tracing::warn!("Failed to parse skill directory {:?}: {}", skill_dir, e);
                        continue;
                    }
                }
            }
        }
    }

    Ok(skills)
}

// ========== Visibility Commands ==========

/// Set skill visibility in a space.
/// Persists both `skill_hash` (legacy) and `skill_id` (stable) for migration safety.
#[tauri::command]
pub async fn set_skill_visibility(
    space_id: String,
    skill_hash: String,
    is_visible: bool,
    library_state: State<'_, LibraryState>,
    visibility_state: State<'_, VisibilityState>,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    let skill_id = resolve_skill_id_from_hash(&skill_hash, &library_state).ok();

    // Update in-memory state
    let mut guard = visibility_state.mappings.lock().map_err(|e| e.to_string())?;
    let space_skills = guard.entry(space_id.clone()).or_insert_with(std::collections::HashSet::new);

    if is_visible {
        space_skills.insert(skill_hash.clone());
    } else {
        space_skills.remove(&skill_hash);
    }

    // Persist to database with both identifiers
    db_state.0.set_visibility_full(&space_id, &skill_hash, skill_id.as_deref(), is_visible)?;

    Ok(())
}

/// Get visible skills for a space.
/// Prefers visibility lookups keyed by skill_id (stable), falling back to skill_hash.
#[tauri::command]
pub async fn get_visible_skills(
    space_id: String,
    library_state: State<'_, LibraryState>,
    db_state: State<'_, DatabaseState>,
) -> Result<Vec<Skill>, String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };

    let Some(library_path) = library_path else {
        return Ok(vec![]);
    };

    let all_skills = get_all_skills_internal(&library_path)?;

    let by_id = db_state.0.get_visibility_map_by_id(&space_id).unwrap_or_default();
    let by_hash = db_state.0.get_visibility_map(&space_id).unwrap_or_default();

    if by_id.is_empty() && by_hash.is_empty() {
        return Ok(all_skills);
    }

    let visible_skills: Vec<Skill> = all_skills
        .into_iter()
        .filter(|s| {
            if let Some(v) = by_id.get(&s.skill_id) {
                return *v;
            }
            by_hash.get(&s.hash).copied().unwrap_or(true)
        })
        .collect();

    Ok(visible_skills)
}

/// Shared visibility filter, matching `get_visible_skills` semantics:
/// - look up by stable `skill_id` first
/// - fall back to legacy `skill_hash`
/// - default to visible when the skill is not in the map (so newly-added skills appear
///   without requiring the user to toggle them on)
///
/// Used by every command that needs "skills visible in space X" (export_*_config,
/// install bulk operations, etc.) so they all behave identically.
fn filter_visible_skills(
    db_state: &State<'_, DatabaseState>,
    space_id: &str,
    all_skills: Vec<Skill>,
) -> Vec<Skill> {
    let by_id = db_state.0.get_visibility_map_by_id(space_id).unwrap_or_default();
    let by_hash = db_state.0.get_visibility_map(space_id).unwrap_or_default();

    if by_id.is_empty() && by_hash.is_empty() {
        return all_skills;
    }

    all_skills
        .into_iter()
        .filter(|s| {
            if let Some(v) = by_id.get(&s.skill_id) {
                return *v;
            }
            by_hash.get(&s.hash).copied().unwrap_or(true)
        })
        .collect()
}

/// Get visibility status for all skills in a space, keyed by current hash.
/// Frontends use this to render checkboxes; we project skill_id-keyed entries back to
/// the current hash by scanning the library.
#[tauri::command]
pub async fn get_skill_visibility_map(
    space_id: String,
    library_state: State<'_, LibraryState>,
    db_state: State<'_, DatabaseState>,
) -> Result<std::collections::HashMap<String, bool>, String> {
    let mut map = db_state.0.get_visibility_map(&space_id).unwrap_or_default();

    let by_id = db_state.0.get_visibility_map_by_id(&space_id).unwrap_or_default();
    if by_id.is_empty() {
        return Ok(map);
    }

    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };

    if let Some(lp) = library_path {
        if let Ok(skills) = get_all_skills_internal(&lp) {
            for s in skills {
                if let Some(v) = by_id.get(&s.skill_id) {
                    map.insert(s.hash, *v);
                }
            }
        }
    }

    Ok(map)
}

/// Set visibility for multiple skills at once.
/// Resolves each hash to its skill_id and persists both for migration safety.
#[tauri::command]
pub async fn set_bulk_skill_visibility(
    space_id: String,
    skill_hashes: Vec<String>,
    is_visible: bool,
    library_state: State<'_, LibraryState>,
    visibility_state: State<'_, VisibilityState>,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    // Build (hash, optional skill_id) pairs.
    let hash_to_id: std::collections::HashMap<String, String> = {
        let library_path = {
            let guard = library_state.path.lock().map_err(|e| e.to_string())?;
            guard.clone()
        };
        match library_path {
            Some(lp) => get_all_skills_internal(&lp)
                .unwrap_or_default()
                .into_iter()
                .map(|s| (s.hash, s.skill_id))
                .collect(),
            None => std::collections::HashMap::new(),
        }
    };

    let entries: Vec<(String, Option<String>)> = skill_hashes
        .iter()
        .map(|h| (h.clone(), hash_to_id.get(h).cloned()))
        .collect();

    // Update in-memory state
    {
        let mut guard = visibility_state.mappings.lock().map_err(|e| e.to_string())?;
        let space_skills = guard.entry(space_id.clone()).or_insert_with(std::collections::HashSet::new);
        for hash in &skill_hashes {
            if is_visible {
                space_skills.insert(hash.clone());
            } else {
                space_skills.remove(hash);
            }
        }
    }

    db_state.0.set_bulk_visibility_full(&space_id, &entries, is_visible)?;

    Ok(())
}

/// Initialize all skills as visible for a space. Persists both `skill_hash` and
/// `skill_id` so the assignment survives later edits to SKILL.md.
#[tauri::command]
pub async fn init_space_visibility(
    space_id: String,
    library_state: State<'_, LibraryState>,
    visibility_state: State<'_, VisibilityState>,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };

    let Some(library_path) = library_path else {
        return Ok(());
    };

    let all_skills = get_all_skills_internal(&library_path)?;

    // Build (hash, Some(skill_id)) pairs so the database row carries the stable id.
    let entries: Vec<(String, Option<String>)> = all_skills
        .iter()
        .map(|s| (s.hash.clone(), Some(s.skill_id.clone())))
        .collect();

    {
        let mut guard = visibility_state.mappings.lock().map_err(|e| e.to_string())?;
        let space_skills = guard
            .entry(space_id.clone())
            .or_insert_with(std::collections::HashSet::new);
        for skill in &all_skills {
            space_skills.insert(skill.hash.clone());
        }
    }

    db_state.0.set_bulk_visibility_full(&space_id, &entries, true)?;

    Ok(())
}

// ========== GitHub Import Commands ==========

/// GitHub file entry
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubFileEntry {
    pub name: String,
    pub path: String,
    pub file_type: String, // "file" or "dir"
    pub size: Option<u64>,
    pub download_url: Option<String>,
}

/// Browse GitHub repository contents
#[tauri::command]
pub async fn browse_github_repo(
    owner: String,
    repo: String,
    path: Option<String>,
    branch: Option<String>,
) -> Result<Vec<GitHubFileEntry>, String> {
    let branch = branch.unwrap_or_else(|| "main".to_string());
    let path = path.unwrap_or_default();
    
    let url = format!(
        "https://api.github.com/repos/{}/{}/contents/{}?ref={}",
        owner, repo, path, branch
    );
    
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch GitHub API: {}", e))?;
    
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("GitHub API error ({}): {}", status, body));
    }
    
    let entries: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;
    
    let files: Vec<GitHubFileEntry> = entries
        .into_iter()
        .map(|entry| GitHubFileEntry {
            name: entry["name"].as_str().unwrap_or("").to_string(),
            path: entry["path"].as_str().unwrap_or("").to_string(),
            file_type: entry["type"].as_str().unwrap_or("file").to_string(),
            size: entry["size"].as_u64(),
            download_url: entry["download_url"].as_str().map(|s| s.to_string()),
        })
        .collect();
    
    Ok(files)
}

/// Preview a skill file from GitHub
#[tauri::command]
pub async fn preview_github_skill(
    owner: String,
    repo: String,
    path: String,
    branch: Option<String>,
) -> Result<SkillPreview, String> {
    let branch = branch.unwrap_or_else(|| "main".to_string());
    
    // Get raw content URL
    let raw_url = format!(
        "https://raw.githubusercontent.com/{}/{}/{}/{}",
        owner, repo, branch, path
    );
    
    // Fetch content
    let response = reqwest::get(&raw_url)
        .await
        .map_err(|e| format!("Failed to fetch file: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Failed to fetch file: HTTP {}", response.status()));
    }
    
    let content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    // Parse metadata
    let metadata = crate::scanner::parse_front_matter(&content)
        .ok_or("Failed to parse skill metadata. Make sure the file has valid YAML front matter.")?;
    
    let source_url = format!(
        "https://github.com/{}/{}/blob/{}/{}",
        owner, repo, branch, path
    );
    
    // Perform risk analysis based on file extension
    let extension = path.rsplit('.').next();
    let risk_analysis = analyze_content_risk(&content, extension);
    
    Ok(SkillPreview {
        metadata,
        content,
        source_url,
        risk_analysis,
    })
}

/// Import a skill from GitHub to library
/// If path points to a SKILL.md file, imports the entire skill directory
/// If path points to a directory containing SKILL.md, imports all files
#[tauri::command]
pub async fn import_github_skill(
    owner: String,
    repo: String,
    path: String,
    branch: Option<String>,
    library_state: State<'_, LibraryState>,
) -> Result<Skill, String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };
    let branch = branch.unwrap_or_else(|| "main".to_string());

    import_github_skill_inner(&owner, &repo, &path, &branch, &library_path).await
}

/// Stateless helper that does the actual GitHub import work.
async fn import_github_skill_inner(
    owner: &str,
    repo: &str,
    path: &str,
    branch: &str,
    library_path: &PathBuf,
) -> Result<Skill, String> {
    let is_skill_md = path.ends_with("SKILL.md");
    let skill_dir_path = if is_skill_md {
        std::path::Path::new(path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default()
    } else {
        path.to_string()
    };

    let skill_md_path = if is_skill_md {
        path.to_string()
    } else {
        format!("{}/SKILL.md", path.trim_end_matches('/'))
    };

    let raw_url = format!(
        "https://raw.githubusercontent.com/{}/{}/{}/{}",
        owner, repo, branch, skill_md_path
    );

    let response = reqwest::get(&raw_url)
        .await
        .map_err(|e| format!("Failed to fetch SKILL.md: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to fetch SKILL.md: HTTP {}", response.status()));
    }

    let skill_md_content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let metadata = crate::scanner::parse_front_matter(&skill_md_content)
        .ok_or("Failed to parse skill metadata")?;

    // Remote frontmatter is uncontrolled; sanitize before joining with the library path.
    let safe_name = sanitize_skill_name(&metadata.name)?;
    let local_skill_dir = library_path.join(&safe_name);
    if local_skill_dir.exists() {
        return Err(format!("A skill with name '{}' already exists", safe_name));
    }

    std::fs::create_dir_all(&local_skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;

    // Patch the frontmatter `name` so it matches the directory we just created.
    let final_content = rewrite_skill_md_name(&skill_md_content, &safe_name)
        .unwrap_or_else(|_| skill_md_content.clone());
    let local_skill_md = local_skill_dir.join("SKILL.md");
    std::fs::write(&local_skill_md, &final_content)
        .map_err(|e| format!("Failed to write SKILL.md: {}", e))?;

    // Best-effort: fetch the rest of the skill directory (scripts/, references/, assets/, etc.)
    let _ = import_github_skill_resources(owner, repo, branch, &skill_dir_path, &local_skill_dir).await;

    let source_url = format!(
        "https://github.com/{}/{}/tree/{}/{}",
        owner, repo, branch, skill_dir_path
    );

    create_skill_from_directory(&local_skill_dir, Some(source_url), Some(library_path))
}

/// Recursively download a GitHub skill directory into `local_dir`.
///
/// Hardening on top of a naive recursive download:
/// - hard recursion depth limit (`MAX_DEPTH = 6`), matching the scanner's spec-recommended walk
/// - skip directories the scanner would also skip (`.git`, `node_modules`, etc.)
/// - reject any entry whose name contains a path separator or `..` (defence against a
///   malicious GitHub API response trying to write outside `local_dir`)
/// - per-file size cap (5 MB) and cumulative download cap to keep storage bounded
///
/// Errors are intentionally swallowed for individual files: extras are best-effort, the
/// import should still succeed once SKILL.md is in place.
async fn import_github_skill_resources(
    owner: &str,
    repo: &str,
    branch: &str,
    github_path: &str,
    local_dir: &std::path::Path,
) -> Result<(), String> {
    // Cumulative size budget shared across the entire recursive walk.
    let budget = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
    import_github_skill_resources_inner(owner, repo, branch, github_path, local_dir, 0, budget).await
}

/// Maximum recursion depth for GitHub skill resource download.
const MAX_GH_DEPTH: usize = 6;
/// Per-file size cap: skip any single file larger than this. Skill scripts/assets are
/// expected to be small; anything bigger is almost certainly a misconfiguration.
const MAX_GH_FILE_BYTES: u64 = 5 * 1024 * 1024;
/// Cumulative byte budget across one skill import.
const MAX_GH_TOTAL_BYTES: u64 = 50 * 1024 * 1024;

fn import_github_skill_resources_inner<'a>(
    owner: &'a str,
    repo: &'a str,
    branch: &'a str,
    github_path: &'a str,
    local_dir: &'a std::path::Path,
    depth: usize,
    budget: std::sync::Arc<std::sync::atomic::AtomicU64>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send + 'a>> {
    Box::pin(async move {
        if depth > MAX_GH_DEPTH {
            return Ok(());
        }

        let client = reqwest::Client::new();
        let url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}?ref={}",
            owner, repo, github_path, branch
        );

        let response = match client
            .get(&url)
            .header("User-Agent", "Skill-Desktop/0.1.0")
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => r,
            _ => return Ok(()),
        };

        let entries: Vec<serde_json::Value> = match response.json().await {
            Ok(v) => v,
            Err(_) => return Ok(()),
        };

        for entry in entries {
            let name = entry["name"].as_str().unwrap_or("");
            let entry_type = entry["type"].as_str().unwrap_or("");
            let entry_path = entry["path"].as_str().unwrap_or("");
            let size = entry["size"].as_u64().unwrap_or(0);

            // SKILL.md is downloaded by the caller; everything else falls through.
            if name == "SKILL.md" {
                continue;
            }
            if name.is_empty() {
                continue;
            }
            // Defence in depth: reject any entry whose name would let us write outside local_dir.
            if name.contains('/')
                || name.contains('\\')
                || name == ".."
                || name == "."
                || crate::scanner::IGNORE_DIR_NAMES.contains(&name)
            {
                continue;
            }

            if entry_type == "dir" {
                let local_subdir = local_dir.join(name);
                let _ = std::fs::create_dir_all(&local_subdir);
                let _ = import_github_skill_resources_inner(
                    owner,
                    repo,
                    branch,
                    entry_path,
                    &local_subdir,
                    depth + 1,
                    std::sync::Arc::clone(&budget),
                )
                .await;
            } else if entry_type == "file" {
                if size > MAX_GH_FILE_BYTES {
                    continue;
                }
                let used = budget.load(std::sync::atomic::Ordering::Relaxed);
                if used.saturating_add(size) > MAX_GH_TOTAL_BYTES {
                    continue;
                }

                let raw_url = format!(
                    "https://raw.githubusercontent.com/{}/{}/{}/{}",
                    owner, repo, branch, entry_path
                );

                if let Ok(resp) = reqwest::get(&raw_url).await {
                    if resp.status().is_success() {
                        if let Ok(content) = resp.bytes().await {
                            // Final size check against the real response body.
                            if content.len() as u64 > MAX_GH_FILE_BYTES {
                                continue;
                            }
                            let after =
                                budget.fetch_add(content.len() as u64, std::sync::atomic::Ordering::Relaxed)
                                    + content.len() as u64;
                            if after > MAX_GH_TOTAL_BYTES {
                                continue;
                            }
                            let local_file = local_dir.join(name);
                            let _ = std::fs::write(&local_file, &content);
                        }
                    }
                }
            }
        }

        Ok(())
    })
}

/// Import multiple skills from a GitHub directory.
///
/// Each entry that contains a parseable SKILL.md (either directly, or inside a subdirectory)
/// becomes its own skill directory under `library_path`. We follow the Agent Skills
/// convention: every skill lives in its own folder with a `SKILL.md` inside, plus optional
/// scripts/ references/ assets/ subdirectories that we copy alongside.
#[tauri::command]
pub async fn import_github_directory(
    owner: String,
    repo: String,
    path: String,
    branch: Option<String>,
    library_state: State<'_, LibraryState>,
) -> Result<ImportResult, String> {
    let branch = branch.unwrap_or_else(|| "main".to_string());

    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    let entries =
        browse_github_repo(owner.clone(), repo.clone(), Some(path.clone()), Some(branch.clone())).await?;

    let mut imported = 0;
    let mut skipped = 0;
    let mut errors: Vec<String> = Vec::new();

    for entry in entries {
        match entry.file_type.as_str() {
            // Each subdirectory is treated as a potential skill: look for its SKILL.md.
            "dir" => {
                let res = import_github_skill_inner(
                    &owner,
                    &repo,
                    &entry.path,
                    &branch,
                    &library_path,
                )
                .await;
                match res {
                    Ok(_) => imported += 1,
                    Err(e) => {
                        // "already exists" or "no SKILL.md" are common and not really errors.
                        if e.contains("already exists") || e.contains("Failed to fetch SKILL.md") {
                            skipped += 1;
                        } else {
                            errors.push(format!("{}: {}", entry.path, e));
                        }
                    }
                }
            }
            // A loose .md file: if it parses as a SKILL.md, wrap it in a new skill directory.
            "file" if entry.name.ends_with(".md") => {
                match import_loose_md_as_skill(&owner, &repo, &branch, &entry, &library_path).await {
                    Ok(true) => imported += 1,
                    Ok(false) => skipped += 1,
                    Err(e) => errors.push(format!("{}: {}", entry.name, e)),
                }
            }
            _ => {}
        }
    }

    Ok(ImportResult { imported, skipped, errors })
}

/// Try to import a loose .md file as a standalone skill. Returns Ok(true) on import,
/// Ok(false) when the file is silently skipped (no frontmatter, name collision, etc.).
async fn import_loose_md_as_skill(
    owner: &str,
    repo: &str,
    branch: &str,
    entry: &GitHubFileEntry,
    library_path: &PathBuf,
) -> Result<bool, String> {
    let raw_url = format!(
        "https://raw.githubusercontent.com/{}/{}/{}/{}",
        owner, repo, branch, entry.path
    );

    let response = reqwest::get(&raw_url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let content = response.text().await.map_err(|e| e.to_string())?;

    // Must have valid SKILL.md frontmatter to be a skill.
    let metadata = match crate::scanner::parse_front_matter(&content) {
        Some(m) => m,
        None => return Ok(false),
    };

    // Sanitize the remote name before joining with the library root.
    let safe_name = match sanitize_skill_name(&metadata.name) {
        Ok(n) => n,
        Err(_) => return Ok(false),
    };
    let skill_dir = library_path.join(&safe_name);
    if skill_dir.exists() {
        return Ok(false);
    }

    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;
    let final_content =
        rewrite_skill_md_name(&content, &safe_name).unwrap_or_else(|_| content.clone());
    std::fs::write(skill_dir.join("SKILL.md"), &final_content)
        .map_err(|e| format!("Failed to write SKILL.md: {}", e))?;

    Ok(true)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

// ========== File Watcher Commands ==========

/// Start file watcher for library directory
#[tauri::command]
pub async fn start_file_watcher(
    library_state: State<'_, LibraryState>,
    watcher_state: State<'_, WatcherState>,
    app_handle: AppHandle,
) -> Result<bool, String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };

    let Some(path) = library_path else {
        return Err("Library path not set".to_string());
    };

    if !path.exists() {
        return Err("Library path does not exist".to_string());
    }

    let mut watcher = watcher_state.0.lock().map_err(|e| e.to_string())?;
    watcher.watch(path, app_handle)?;

    Ok(true)
}

/// Stop file watcher
#[tauri::command]
pub async fn stop_file_watcher(
    watcher_state: State<'_, WatcherState>,
) -> Result<bool, String> {
    let mut watcher = watcher_state.0.lock().map_err(|e| e.to_string())?;
    watcher.stop();
    Ok(true)
}

/// Check if file watcher is running
#[tauri::command]
pub async fn is_file_watcher_running(
    watcher_state: State<'_, WatcherState>,
) -> Result<bool, String> {
    let watcher = watcher_state.0.lock().map_err(|e| e.to_string())?;
    Ok(watcher.is_watching())
}

// ========== MCP Server Commands ==========

/// MCP Tool info
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// MCP Server response for tools list
#[derive(Debug, Clone, serde::Deserialize)]
struct McpToolsResponse {
    tools: Vec<McpToolRaw>,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct McpToolRaw {
    name: String,
    description: Option<String>,
    #[serde(rename = "inputSchema")]
    input_schema: Option<serde_json::Value>,
}

/// Connect to MCP server and list available tools
#[tauri::command]
pub async fn connect_mcp_server(url: String) -> Result<Vec<McpTool>, String> {
    // MCP servers typically expose a JSON-RPC endpoint
    // We'll try to list tools using the standard MCP protocol
    
    let client = reqwest::Client::new();
    
    // Try to get tools list via JSON-RPC
    let request_body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/list",
        "params": {}
    });
    
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to MCP server: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("MCP server returned error: {}", response.status()));
    }
    
    let response_body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse MCP response: {}", e))?;
    
    // Parse the result
    let tools_result = response_body.get("result")
        .ok_or("Invalid MCP response: missing result")?;
    
    let tools_response: McpToolsResponse = serde_json::from_value(tools_result.clone())
        .map_err(|e| format!("Failed to parse tools list: {}", e))?;
    
    let tools: Vec<McpTool> = tools_response.tools
        .into_iter()
        .map(|t| McpTool {
            name: t.name,
            description: t.description.unwrap_or_default(),
            input_schema: t.input_schema.unwrap_or(serde_json::json!({})),
        })
        .collect();
    
    Ok(tools)
}

/// Convert MCP tool to Skill and save to library
#[tauri::command]
pub async fn import_mcp_tool_as_skill(
    server_url: String,
    tool_name: String,
    tool_description: String,
    input_schema: serde_json::Value,
    library_state: State<'_, LibraryState>,
) -> Result<Skill, String> {
    // Get library path
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };
    
    // Parse input schema to extract parameters
    let parameters = parse_json_schema_to_parameters(&input_schema);
    
    // Generate skill file content
    let skill_content = generate_mcp_skill_content(
        &tool_name,
        &tool_description,
        &server_url,
        &parameters,
    );
    
    // Generate a safe skill directory name from the MCP tool name.
    let skill_name = sanitize_skill_name(&tool_name)?;

    let skill_dir = library_path.join(&skill_name);
    if skill_dir.exists() {
        return Err(format!("A skill with name '{}' already exists", skill_name));
    }

    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;

    // generate_mcp_skill_content writes the original tool_name into the frontmatter;
    // rewrite it so the on-disk `name:` matches the sanitized directory.
    let final_content =
        rewrite_skill_md_name(&skill_content, &skill_name).unwrap_or(skill_content);
    let skill_md_path = skill_dir.join("SKILL.md");
    std::fs::write(&skill_md_path, &final_content)
        .map_err(|e| format!("Failed to write SKILL.md: {}", e))?;

    create_skill_from_directory(&skill_dir, Some(server_url), Some(&library_path))
}

/// Parse JSON Schema to parameter list
fn parse_json_schema_to_parameters(schema: &serde_json::Value) -> Vec<(String, String, bool, String)> {
    let mut params = Vec::new();
    
    if let Some(properties) = schema.get("properties").and_then(|p| p.as_object()) {
        let required: Vec<String> = schema.get("required")
            .and_then(|r| r.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();
        
        for (name, prop) in properties {
            let param_type = prop.get("type")
                .and_then(|t| t.as_str())
                .unwrap_or("string")
                .to_string();
            
            let description = prop.get("description")
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .to_string();
            
            let is_required = required.contains(name);
            
            params.push((name.clone(), param_type, is_required, description));
        }
    }
    
    params
}

/// Generate SKILL.md content for MCP tool
fn generate_mcp_skill_content(
    name: &str,
    description: &str,
    server_url: &str,
    parameters: &[(String, String, bool, String)],
) -> String {
    // Build the spec-compliant frontmatter via serde_yaml so any special characters
    // in name/description/server_url are escaped correctly (no more manual `\"`).
    //
    // Per https://agentskills.io/specification, the only top-level frontmatter keys
    // are name, description, license, compatibility, allowed-tools, metadata.
    // We stash MCP-specific extras (server URL, parameters, source kind) inside `metadata`.
    let mut metadata = serde_yaml::Mapping::new();
    metadata.insert(
        serde_yaml::Value::String("source".to_string()),
        serde_yaml::Value::String("mcp".to_string()),
    );
    metadata.insert(
        serde_yaml::Value::String("server_url".to_string()),
        serde_yaml::Value::String(server_url.to_string()),
    );

    if !parameters.is_empty() {
        let mut params_seq = Vec::new();
        for (pname, ptype, required, pdesc) in parameters {
            let mut m = serde_yaml::Mapping::new();
            m.insert(
                serde_yaml::Value::String("name".to_string()),
                serde_yaml::Value::String(pname.clone()),
            );
            m.insert(
                serde_yaml::Value::String("type".to_string()),
                serde_yaml::Value::String(ptype.clone()),
            );
            m.insert(
                serde_yaml::Value::String("required".to_string()),
                serde_yaml::Value::Bool(*required),
            );
            m.insert(
                serde_yaml::Value::String("description".to_string()),
                serde_yaml::Value::String(pdesc.clone()),
            );
            params_seq.push(serde_yaml::Value::Mapping(m));
        }
        metadata.insert(
            serde_yaml::Value::String("parameters".to_string()),
            serde_yaml::Value::Sequence(params_seq),
        );
    }

    let mut front = serde_yaml::Mapping::new();
    front.insert(
        serde_yaml::Value::String("name".to_string()),
        serde_yaml::Value::String(name.to_string()),
    );
    front.insert(
        serde_yaml::Value::String("description".to_string()),
        serde_yaml::Value::String(description.to_string()),
    );
    front.insert(
        serde_yaml::Value::String("metadata".to_string()),
        serde_yaml::Value::Mapping(metadata),
    );

    let yaml = serde_yaml::to_string(&serde_yaml::Value::Mapping(front))
        .unwrap_or_else(|_| String::new());

    format!(
        "---\n{}---\n\n# {}\n\n{}\n\n## MCP Server\n\nThis skill was imported from an MCP server.\n\n- **Server URL**: {}\n\n## Usage\n\nThis skill can be invoked through the MCP protocol.\n",
        yaml, name, description, server_url
    )
}

// ========== MCP Registry Commands ==========

/// Supported MCP registries
#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpRegistry {
    Glama,
    McpSo,
    McpServersOrg,
    Smithery,
}

/// MCP server entry from registry
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpRegistryEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: Option<String>,
    pub repository: Option<String>,
    pub homepage: Option<String>,
    pub tags: Vec<String>,
    pub registry: String,
}

/// Search MCP registries for servers
#[tauri::command]
pub async fn search_mcp_registry(
    query: String,
    registry: Option<McpRegistry>,
) -> Result<Vec<McpRegistryEntry>, String> {
    let mut all_results = Vec::new();
    
    // Search specified registry or all registries
    let registries = match registry {
        Some(r) => vec![r],
        None => vec![McpRegistry::Glama, McpRegistry::McpSo, McpRegistry::McpServersOrg],
    };
    
    for reg in registries {
        match reg {
            McpRegistry::Glama => {
                if let Ok(results) = search_glama(&query).await {
                    all_results.extend(results);
                }
            }
            McpRegistry::McpSo => {
                if let Ok(results) = search_mcp_so(&query).await {
                    all_results.extend(results);
                }
            }
            McpRegistry::McpServersOrg => {
                if let Ok(results) = search_mcpservers_org(&query).await {
                    all_results.extend(results);
                }
            }
            McpRegistry::Smithery => {
                if let Ok(results) = search_smithery(&query).await {
                    all_results.extend(results);
                }
            }
        }
    }
    
    Ok(all_results)
}

/// Get popular/featured MCP servers from registries
#[tauri::command]
pub async fn get_featured_mcp_servers(
    registry: Option<McpRegistry>,
) -> Result<Vec<McpRegistryEntry>, String> {
    let mut all_results = Vec::new();
    
    let registries = match registry {
        Some(r) => vec![r],
        None => vec![McpRegistry::Glama, McpRegistry::McpSo, McpRegistry::McpServersOrg],
    };
    
    for reg in registries {
        match reg {
            McpRegistry::Glama => {
                if let Ok(results) = get_glama_featured().await {
                    all_results.extend(results);
                }
            }
            McpRegistry::McpSo => {
                if let Ok(results) = get_mcp_so_featured().await {
                    all_results.extend(results);
                }
            }
            McpRegistry::McpServersOrg => {
                if let Ok(results) = get_mcpservers_org_featured().await {
                    all_results.extend(results);
                }
            }
            McpRegistry::Smithery => {
                if let Ok(results) = get_smithery_featured().await {
                    all_results.extend(results);
                }
            }
        }
    }
    
    Ok(all_results)
}

/// Get MCP server details from registry
#[tauri::command]
pub async fn get_mcp_server_details(
    server_id: String,
    registry: McpRegistry,
) -> Result<McpRegistryEntry, String> {
    match registry {
        McpRegistry::Glama => get_glama_server_details(&server_id).await,
        McpRegistry::McpSo => get_mcp_so_server_details(&server_id).await,
        McpRegistry::McpServersOrg => get_mcpservers_org_server_details(&server_id).await,
        McpRegistry::Smithery => get_smithery_server_details(&server_id).await,
    }
}

// ========== Glama.ai Parser ==========

async fn search_glama(query: &str) -> Result<Vec<McpRegistryEntry>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://glama.ai/api/mcp/servers?q={}", urlencoding::encode(query));
    
    let response = client
        .get(&url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Glama API: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Glama API error: {}", response.status()));
    }
    
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Glama response: {}", e))?;
    
    parse_glama_response(&data)
}

async fn get_glama_featured() -> Result<Vec<McpRegistryEntry>, String> {
    let client = reqwest::Client::new();
    let url = "https://glama.ai/api/mcp/servers?featured=true&limit=20";
    
    let response = client
        .get(url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Glama API: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Glama API error: {}", response.status()));
    }
    
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Glama response: {}", e))?;
    
    parse_glama_response(&data)
}

async fn get_glama_server_details(server_id: &str) -> Result<McpRegistryEntry, String> {
    let client = reqwest::Client::new();
    let url = format!("https://glama.ai/api/mcp/servers/{}", server_id);
    
    let response = client
        .get(&url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Glama API: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Glama API error: {}", response.status()));
    }
    
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Glama response: {}", e))?;
    
    parse_glama_server(&data)
}

fn parse_glama_response(data: &serde_json::Value) -> Result<Vec<McpRegistryEntry>, String> {
    let servers = data.get("servers")
        .or_else(|| data.get("data"))
        .and_then(|s| s.as_array())
        .ok_or("Invalid Glama response format")?;
    
    let entries: Vec<McpRegistryEntry> = servers
        .iter()
        .filter_map(|server| parse_glama_server(server).ok())
        .collect();
    
    Ok(entries)
}

fn parse_glama_server(server: &serde_json::Value) -> Result<McpRegistryEntry, String> {
    let id = server.get("id")
        .or_else(|| server.get("slug"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    let name = server.get("name")
        .or_else(|| server.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or(&id)
        .to_string();
    
    let description = server.get("description")
        .or_else(|| server.get("summary"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    let author = server.get("author")
        .or_else(|| server.get("owner"))
        .and_then(|v| v.as_str())
        .map(String::from);
    
    let repository = server.get("repository")
        .or_else(|| server.get("repo"))
        .or_else(|| server.get("github"))
        .and_then(|v| v.as_str())
        .map(String::from);
    
    let homepage = server.get("homepage")
        .or_else(|| server.get("url"))
        .and_then(|v| v.as_str())
        .map(String::from);
    
    let tags = server.get("tags")
        .or_else(|| server.get("categories"))
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|t| t.as_str().map(String::from)).collect())
        .unwrap_or_default();
    
    Ok(McpRegistryEntry {
        id,
        name,
        description,
        author,
        repository,
        homepage,
        tags,
        registry: "glama".to_string(),
    })
}

// ========== MCP.so Parser ==========

async fn search_mcp_so(query: &str) -> Result<Vec<McpRegistryEntry>, String> {
    let client = reqwest::Client::new();
    // MCP.so uses a different API structure - try to fetch and filter client-side
    let url = format!("https://mcp.so/api/servers?search={}", urlencoding::encode(query));
    
    let response = client
        .get(&url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch MCP.so API: {}", e))?;
    
    if !response.status().is_success() {
        // Try alternative endpoint
        return search_mcp_so_fallback(query).await;
    }
    
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse MCP.so response: {}", e))?;
    
    parse_mcp_so_response(&data)
}

async fn search_mcp_so_fallback(query: &str) -> Result<Vec<McpRegistryEntry>, String> {
    // Fallback: fetch all and filter
    let all = get_mcp_so_featured().await?;
    let query_lower = query.to_lowercase();
    
    Ok(all.into_iter()
        .filter(|e| {
            e.name.to_lowercase().contains(&query_lower) ||
            e.description.to_lowercase().contains(&query_lower) ||
            e.tags.iter().any(|t| t.to_lowercase().contains(&query_lower))
        })
        .collect())
}

async fn get_mcp_so_featured() -> Result<Vec<McpRegistryEntry>, String> {
    let client = reqwest::Client::new();
    let url = "https://mcp.so/api/servers";
    
    let response = client
        .get(url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch MCP.so API: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("MCP.so API error: {}", response.status()));
    }
    
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse MCP.so response: {}", e))?;
    
    parse_mcp_so_response(&data)
}

async fn get_mcp_so_server_details(server_id: &str) -> Result<McpRegistryEntry, String> {
    let client = reqwest::Client::new();
    let url = format!("https://mcp.so/api/servers/{}", server_id);
    
    let response = client
        .get(&url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch MCP.so API: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("MCP.so API error: {}", response.status()));
    }
    
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse MCP.so response: {}", e))?;
    
    parse_mcp_so_server(&data)
}

fn parse_mcp_so_response(data: &serde_json::Value) -> Result<Vec<McpRegistryEntry>, String> {
    let servers = data.get("servers")
        .or_else(|| data.get("data"))
        .or_else(|| data.as_array().map(|_| data))
        .and_then(|s| s.as_array())
        .ok_or("Invalid MCP.so response format")?;
    
    let entries: Vec<McpRegistryEntry> = servers
        .iter()
        .filter_map(|server| parse_mcp_so_server(server).ok())
        .collect();
    
    Ok(entries)
}

fn parse_mcp_so_server(server: &serde_json::Value) -> Result<McpRegistryEntry, String> {
    let id = server.get("id")
        .or_else(|| server.get("slug"))
        .or_else(|| server.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    let name = server.get("name")
        .or_else(|| server.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or(&id)
        .to_string();
    
    let description = server.get("description")
        .or_else(|| server.get("summary"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    let author = server.get("author")
        .or_else(|| server.get("owner"))
        .or_else(|| server.get("publisher"))
        .and_then(|v| v.as_str())
        .map(String::from);
    
    let repository = server.get("repository")
        .or_else(|| server.get("repo"))
        .or_else(|| server.get("github"))
        .or_else(|| server.get("source"))
        .and_then(|v| v.as_str())
        .map(String::from);
    
    let homepage = server.get("homepage")
        .or_else(|| server.get("url"))
        .or_else(|| server.get("website"))
        .and_then(|v| v.as_str())
        .map(String::from);
    
    let tags = server.get("tags")
        .or_else(|| server.get("categories"))
        .or_else(|| server.get("keywords"))
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|t| t.as_str().map(String::from)).collect())
        .unwrap_or_default();
    
    Ok(McpRegistryEntry {
        id,
        name,
        description,
        author,
        repository,
        homepage,
        tags,
        registry: "mcp.so".to_string(),
    })
}

// ========== MCPServers.org Parser ==========

async fn search_mcpservers_org(query: &str) -> Result<Vec<McpRegistryEntry>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://mcpservers.org/api/servers?q={}", urlencoding::encode(query));
    
    let response = client
        .get(&url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch MCPServers.org API: {}", e))?;
    
    if !response.status().is_success() {
        return search_mcpservers_org_fallback(query).await;
    }
    
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse MCPServers.org response: {}", e))?;
    
    parse_mcpservers_org_response(&data)
}

async fn search_mcpservers_org_fallback(query: &str) -> Result<Vec<McpRegistryEntry>, String> {
    let all = get_mcpservers_org_featured().await?;
    let query_lower = query.to_lowercase();
    
    Ok(all.into_iter()
        .filter(|e| {
            e.name.to_lowercase().contains(&query_lower) ||
            e.description.to_lowercase().contains(&query_lower) ||
            e.tags.iter().any(|t| t.to_lowercase().contains(&query_lower))
        })
        .collect())
}

async fn get_mcpservers_org_featured() -> Result<Vec<McpRegistryEntry>, String> {
    let client = reqwest::Client::new();
    let url = "https://mcpservers.org/api/servers";
    
    let response = client
        .get(url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch MCPServers.org API: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("MCPServers.org API error: {}", response.status()));
    }
    
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse MCPServers.org response: {}", e))?;
    
    parse_mcpservers_org_response(&data)
}

async fn get_mcpservers_org_server_details(server_id: &str) -> Result<McpRegistryEntry, String> {
    let client = reqwest::Client::new();
    let url = format!("https://mcpservers.org/api/servers/{}", server_id);
    
    let response = client
        .get(&url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch MCPServers.org API: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("MCPServers.org API error: {}", response.status()));
    }
    
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse MCPServers.org response: {}", e))?;
    
    parse_mcpservers_org_server(&data)
}

fn parse_mcpservers_org_response(data: &serde_json::Value) -> Result<Vec<McpRegistryEntry>, String> {
    let servers = data.get("servers")
        .or_else(|| data.get("data"))
        .or_else(|| data.as_array().map(|_| data))
        .and_then(|s| s.as_array())
        .ok_or("Invalid MCPServers.org response format")?;
    
    let entries: Vec<McpRegistryEntry> = servers
        .iter()
        .filter_map(|server| parse_mcpservers_org_server(server).ok())
        .collect();
    
    Ok(entries)
}

fn parse_mcpservers_org_server(server: &serde_json::Value) -> Result<McpRegistryEntry, String> {
    let id = server.get("id")
        .or_else(|| server.get("slug"))
        .or_else(|| server.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    let name = server.get("name")
        .or_else(|| server.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or(&id)
        .to_string();
    
    let description = server.get("description")
        .or_else(|| server.get("summary"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    let author = server.get("author")
        .or_else(|| server.get("owner"))
        .and_then(|v| v.as_str())
        .map(String::from);
    
    let repository = server.get("repository")
        .or_else(|| server.get("repo"))
        .or_else(|| server.get("github"))
        .and_then(|v| v.as_str())
        .map(String::from);
    
    let homepage = server.get("homepage")
        .or_else(|| server.get("url"))
        .and_then(|v| v.as_str())
        .map(String::from);
    
    let tags = server.get("tags")
        .or_else(|| server.get("categories"))
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|t| t.as_str().map(String::from)).collect())
        .unwrap_or_default();
    
    Ok(McpRegistryEntry {
        id,
        name,
        description,
        author,
        repository,
        homepage,
        tags,
        registry: "mcpservers.org".to_string(),
    })
}

// ========== Smithery.ai Parser ==========

async fn search_smithery(query: &str) -> Result<Vec<McpRegistryEntry>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://smithery.ai/api/servers?q={}", urlencoding::encode(query));
    
    let response = client
        .get(&url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Smithery API: {}", e))?;
    
    if !response.status().is_success() {
        // Smithery often rate limits, return empty
        return Ok(vec![]);
    }
    
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Smithery response: {}", e))?;
    
    parse_smithery_response(&data)
}

async fn get_smithery_featured() -> Result<Vec<McpRegistryEntry>, String> {
    let client = reqwest::Client::new();
    let url = "https://smithery.ai/api/servers?featured=true";
    
    let response = client
        .get(url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Smithery API: {}", e))?;
    
    if !response.status().is_success() {
        return Ok(vec![]);
    }
    
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Smithery response: {}", e))?;
    
    parse_smithery_response(&data)
}

async fn get_smithery_server_details(server_id: &str) -> Result<McpRegistryEntry, String> {
    let client = reqwest::Client::new();
    let url = format!("https://smithery.ai/api/servers/{}", server_id);
    
    let response = client
        .get(&url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Smithery API: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Smithery API error: {}", response.status()));
    }
    
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Smithery response: {}", e))?;
    
    parse_smithery_server(&data)
}

fn parse_smithery_response(data: &serde_json::Value) -> Result<Vec<McpRegistryEntry>, String> {
    let servers = data.get("servers")
        .or_else(|| data.get("data"))
        .or_else(|| data.as_array().map(|_| data))
        .and_then(|s| s.as_array())
        .ok_or("Invalid Smithery response format")?;
    
    let entries: Vec<McpRegistryEntry> = servers
        .iter()
        .filter_map(|server| parse_smithery_server(server).ok())
        .collect();
    
    Ok(entries)
}

fn parse_smithery_server(server: &serde_json::Value) -> Result<McpRegistryEntry, String> {
    let id = server.get("id")
        .or_else(|| server.get("slug"))
        .or_else(|| server.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    let name = server.get("name")
        .or_else(|| server.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or(&id)
        .to_string();
    
    let description = server.get("description")
        .or_else(|| server.get("summary"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    let author = server.get("author")
        .or_else(|| server.get("owner"))
        .and_then(|v| v.as_str())
        .map(String::from);
    
    let repository = server.get("repository")
        .or_else(|| server.get("repo"))
        .or_else(|| server.get("github"))
        .and_then(|v| v.as_str())
        .map(String::from);
    
    let homepage = server.get("homepage")
        .or_else(|| server.get("url"))
        .and_then(|v| v.as_str())
        .map(String::from);
    
    let tags = server.get("tags")
        .or_else(|| server.get("categories"))
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|t| t.as_str().map(String::from)).collect())
        .unwrap_or_default();
    
    Ok(McpRegistryEntry {
        id,
        name,
        description,
        author,
        repository,
        homepage,
        tags,
        registry: "smithery".to_string(),
    })
}

/// Import MCP server from registry as skill
#[tauri::command]
pub async fn import_mcp_registry_server(
    entry: McpRegistryEntry,
    library_state: State<'_, LibraryState>,
) -> Result<Skill, String> {
    // Get library path
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };
    
    // Sanitize the registry-supplied name to a safe directory name.
    let skill_name = sanitize_skill_name(&entry.name)?;

    // Generate skill content; the generator uses entry.name verbatim for the
    // frontmatter, which we'll patch below to keep it consistent with the directory.
    let skill_content = generate_registry_skill_content(&entry);
    let skill_content =
        rewrite_skill_md_name(&skill_content, &skill_name).unwrap_or(skill_content);

    let skill_dir = library_path.join(&skill_name);
    if skill_dir.exists() {
        return Err(format!("A skill with name '{}' already exists", skill_name));
    }
    
    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;
    
    // Write SKILL.md
    let skill_md_path = skill_dir.join("SKILL.md");
    std::fs::write(&skill_md_path, &skill_content)
        .map_err(|e| format!("Failed to write SKILL.md: {}", e))?;
    
    let source_url = entry.repository.or(entry.homepage);
    create_skill_from_directory(&skill_dir, source_url, Some(&library_path))
}

/// Generate skill content from registry entry
fn generate_registry_skill_content(entry: &McpRegistryEntry) -> String {
    // Same approach as generate_mcp_skill_content: spec-compliant frontmatter built via
    // serde_yaml; everything non-spec lives inside `metadata`.
    let mut metadata = serde_yaml::Mapping::new();
    metadata.insert(
        serde_yaml::Value::String("source".to_string()),
        serde_yaml::Value::String("mcp_registry".to_string()),
    );
    metadata.insert(
        serde_yaml::Value::String("registry".to_string()),
        serde_yaml::Value::String(entry.registry.clone()),
    );
    if let Some(a) = &entry.author {
        metadata.insert(
            serde_yaml::Value::String("author".to_string()),
            serde_yaml::Value::String(a.clone()),
        );
    }
    if let Some(r) = &entry.repository {
        metadata.insert(
            serde_yaml::Value::String("repository".to_string()),
            serde_yaml::Value::String(r.clone()),
        );
    }
    if let Some(h) = &entry.homepage {
        metadata.insert(
            serde_yaml::Value::String("homepage".to_string()),
            serde_yaml::Value::String(h.clone()),
        );
    }

    let mut tags = entry.tags.clone();
    if !tags.contains(&"mcp".to_string()) {
        tags.push("mcp".to_string());
    }
    if !tags.contains(&"registry".to_string()) {
        tags.push("registry".to_string());
    }
    metadata.insert(
        serde_yaml::Value::String("tags".to_string()),
        serde_yaml::Value::Sequence(
            tags.into_iter().map(serde_yaml::Value::String).collect(),
        ),
    );

    let mut front = serde_yaml::Mapping::new();
    front.insert(
        serde_yaml::Value::String("name".to_string()),
        serde_yaml::Value::String(entry.name.clone()),
    );
    front.insert(
        serde_yaml::Value::String("description".to_string()),
        serde_yaml::Value::String(entry.description.clone()),
    );
    front.insert(
        serde_yaml::Value::String("metadata".to_string()),
        serde_yaml::Value::Mapping(metadata),
    );

    let yaml = serde_yaml::to_string(&serde_yaml::Value::Mapping(front))
        .unwrap_or_else(|_| String::new());

    let repo_section = entry
        .repository
        .as_ref()
        .map(|r| format!("- **Repository**: {}\n", r))
        .unwrap_or_default();
    let homepage_section = entry
        .homepage
        .as_ref()
        .map(|h| format!("- **Homepage**: {}\n", h))
        .unwrap_or_default();

    format!(
        "---\n{}---\n\n# {}\n\n{}\n\n## Source\n\n- **Registry**: {}\n{}{}\n## Installation\n\nThis MCP server was imported from the {} registry. Please refer to the repository for installation instructions.\n",
        yaml,
        entry.name,
        entry.description,
        entry.registry,
        repo_section,
        homepage_section,
        entry.registry
    )
}

// ========== App Settings Commands ==========

/// App settings structure stored as JSON
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// User's preferred language
    pub language: Option<String>,
    /// Whether the user has completed initial setup
    pub setup_completed: bool,
    /// Theme preference
    pub theme: Option<String>,
}

/// Get the app settings file path
fn get_settings_file_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    // Ensure directory exists
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    
    Ok(app_data_dir.join("settings.json"))
}

/// Load app settings from JSON file
#[tauri::command]
pub async fn load_app_settings(app_handle: AppHandle) -> Result<AppSettings, String> {
    let settings_path = get_settings_file_path(&app_handle)?;
    
    if !settings_path.exists() {
        return Ok(AppSettings::default());
    }
    
    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;
    
    let settings: AppSettings = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;
    
    Ok(settings)
}

/// Save app settings to JSON file
#[tauri::command]
pub async fn save_app_settings(
    app_handle: AppHandle,
    settings: AppSettings,
) -> Result<(), String> {
    let settings_path = get_settings_file_path(&app_handle)?;
    
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    std::fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;
    
    Ok(())
}

/// Update a single setting in the app settings
#[tauri::command]
pub async fn update_app_setting(
    app_handle: AppHandle,
    key: String,
    value: String,
) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(app_handle.clone()).await?;
    
    match key.as_str() {
        "language" => settings.language = Some(value),
        "theme" => settings.theme = Some(value),
        "setupCompleted" => settings.setup_completed = value == "true",
        _ => return Err(format!("Unknown setting key: {}", key)),
    }
    
    save_app_settings(app_handle, settings.clone()).await?;
    
    Ok(settings)
}

// ========== Batch Export Commands ==========

/// Export multiple skills as a single combined file
#[tauri::command]
pub async fn export_skills_batch(
    skill_hashes: Vec<String>,
    library_state: State<'_, LibraryState>,
) -> Result<String, String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    let all_skills = get_all_skills_internal(&library_path)?;
    
    // Filter to requested skills
    let hash_set: std::collections::HashSet<_> = skill_hashes.iter().collect();
    let skills: Vec<_> = all_skills.into_iter()
        .filter(|s| hash_set.contains(&s.hash))
        .collect();

    if skills.is_empty() {
        return Err("No matching skills found".to_string());
    }

    // Build combined export
    let mut combined_content = String::new();
    combined_content.push_str("# Skill Desktop Export\n\n");
    combined_content.push_str(&format!("Exported {} skill(s) on {}\n\n", skills.len(), chrono_now()));
    combined_content.push_str("---\n\n");

    for skill in &skills {
        // Read skill file content
        let content = std::fs::read_to_string(&skill.local_path)
            .map_err(|e| format!("Failed to read skill file {}: {}", skill.local_path, e))?;
        
        combined_content.push_str(&format!("## {}\n\n", skill.name));
        combined_content.push_str(&format!("**Version**: {}\n", skill.version));
        combined_content.push_str(&format!("**Author**: {}\n", skill.author.as_deref().unwrap_or("Unknown")));
        combined_content.push_str(&format!("**Tags**: {}\n", skill.tags.join(", ")));
        combined_content.push_str(&format!("**Permissions**: {}\n\n", skill.permissions.join(", ")));
        combined_content.push_str("### Content\n\n");
        combined_content.push_str("```markdown\n");
        combined_content.push_str(&content);
        combined_content.push_str("\n```\n\n");
        combined_content.push_str("---\n\n");
    }

    Ok(combined_content)
}

/// Export multiple skills as JSON
#[tauri::command]
pub async fn export_skills_batch_json(
    skill_hashes: Vec<String>,
    library_state: State<'_, LibraryState>,
) -> Result<String, String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    let all_skills = get_all_skills_internal(&library_path)?;
    
    // Filter to requested skills
    let hash_set: std::collections::HashSet<_> = skill_hashes.iter().collect();
    let skills: Vec<_> = all_skills.into_iter()
        .filter(|s| hash_set.contains(&s.hash))
        .collect();

    if skills.is_empty() {
        return Err("No matching skills found".to_string());
    }

    // Build JSON export with content
    let mut skill_exports = Vec::new();
    for skill in &skills {
        let content = std::fs::read_to_string(&skill.local_path)
            .map_err(|e| format!("Failed to read skill file {}: {}", skill.local_path, e))?;
        
        skill_exports.push(serde_json::json!({
            "name": skill.name,
            "version": skill.version,
            "description": skill.description,
            "author": skill.author,
            "tags": skill.tags,
            "permissions": skill.permissions,
            "parameters": skill.parameters,
            "content": content
        }));
    }

    let export = serde_json::json!({
        "version": "1.0",
        "exportedAt": chrono_now(),
        "skillCount": skills.len(),
        "skills": skill_exports
    });

    serde_json::to_string_pretty(&export).map_err(|e| e.to_string())
}

// ========== Version History Commands ==========

/// Record a skill change in history
#[tauri::command]
pub async fn record_skill_change(
    skill_hash: String,
    skill_name: String,
    version: String,
    content_hash: String,
    change_type: String,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    db_state.0.add_skill_history(&skill_hash, &skill_name, &version, &content_hash, &change_type)
}

/// Get history for a specific skill
#[tauri::command]
pub async fn get_skill_history(
    skill_hash: String,
    db_state: State<'_, DatabaseState>,
) -> Result<Vec<crate::database::SkillHistoryEntry>, String> {
    db_state.0.get_skill_history(&skill_hash)
}

/// Get recent skill history across all skills
#[tauri::command]
pub async fn get_recent_skill_history(
    limit: Option<i64>,
    db_state: State<'_, DatabaseState>,
) -> Result<Vec<crate::database::SkillHistoryEntry>, String> {
    db_state.0.get_all_skill_history(limit.unwrap_or(50))
}

// ========== Update Detection Commands ==========

/// Check if a skill from URL has updates available
#[tauri::command]
pub async fn check_skill_update(
    source_url: String,
    current_hash: String,
) -> Result<UpdateCheckResult, String> {
    // Fetch the remote content
    let client = reqwest::Client::new();
    let response = client
        .get(&source_url)
        .header("User-Agent", "skill-desktop/1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Calculate hash of remote content
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let remote_hash = format!("{:x}", hasher.finalize());

    let has_update = remote_hash != current_hash;

    Ok(UpdateCheckResult {
        has_update,
        current_hash,
        remote_hash,
        source_url,
    })
}

/// Result of update check
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_hash: String,
    pub remote_hash: String,
    pub source_url: String,
}

/// Check updates for all skills with source URLs
#[tauri::command]
pub async fn check_all_skill_updates(
    library_state: State<'_, LibraryState>,
) -> Result<Vec<SkillUpdateInfo>, String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    let all_skills = get_all_skills_internal(&library_path)?;
    
    // Filter to skills with source URLs
    let skills_with_urls: Vec<_> = all_skills
        .into_iter()
        .filter(|s| s.source_url.is_some())
        .collect();

    let client = reqwest::Client::new();
    let mut results = Vec::new();

    for skill in skills_with_urls {
        let source_url = skill.source_url.as_ref().unwrap();
        
        // Try to fetch and check for updates
        match client
            .get(source_url)
            .header("User-Agent", "skill-desktop/1.0")
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => {
                if let Ok(content) = response.text().await {
                    use sha2::{Digest, Sha256};
                    let mut hasher = Sha256::new();
                    hasher.update(content.as_bytes());
                    let remote_hash = format!("{:x}", hasher.finalize());

                    if remote_hash != skill.hash {
                        results.push(SkillUpdateInfo {
                            skill_hash: skill.hash.clone(),
                            skill_name: skill.name.clone(),
                            source_url: source_url.clone(),
                            has_update: true,
                            error: None,
                        });
                    }
                }
            }
            Ok(response) => {
                results.push(SkillUpdateInfo {
                    skill_hash: skill.hash.clone(),
                    skill_name: skill.name.clone(),
                    source_url: source_url.clone(),
                    has_update: false,
                    error: Some(format!("HTTP error: {}", response.status())),
                });
            }
            Err(e) => {
                results.push(SkillUpdateInfo {
                    skill_hash: skill.hash.clone(),
                    skill_name: skill.name.clone(),
                    source_url: source_url.clone(),
                    has_update: false,
                    error: Some(format!("Request failed: {}", e)),
                });
            }
        }
    }

    Ok(results)
}

/// Information about a skill update
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillUpdateInfo {
    pub skill_hash: String,
    pub skill_name: String,
    pub source_url: String,
    pub has_update: bool,
    pub error: Option<String>,
}

// ========== LLM Commands ==========

/// LLM provider type
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LLMProviderType {
    OpenaiCompatible,
    Anthropic,
    OpenaiResponses,
}

/// Test LLM connection request
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LLMTestRequest {
    pub provider_type: LLMProviderType,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

/// Test LLM connection result
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LLMTestResult {
    pub success: bool,
    pub message: String,
}

/// Test LLM provider connection
#[tauri::command]
pub async fn test_llm_connection(request: LLMTestRequest) -> Result<LLMTestResult, String> {
    let client = reqwest::Client::new();
    
    let result = match request.provider_type {
        LLMProviderType::OpenaiCompatible => {
            test_openai_compatible(&client, &request).await
        }
        LLMProviderType::Anthropic => {
            test_anthropic(&client, &request).await
        }
        LLMProviderType::OpenaiResponses => {
            test_openai_responses(&client, &request).await
        }
    };
    
    Ok(result)
}

async fn test_openai_compatible(client: &reqwest::Client, request: &LLMTestRequest) -> LLMTestResult {
    let url = format!("{}/chat/completions", request.base_url);
    
    let body = serde_json::json!({
        "model": request.model,
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Hello"}]
    });
    
    match client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", request.api_key))
        .json(&body)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                LLMTestResult {
                    success: true,
                    message: "Connection successful!".to_string(),
                }
            } else {
                let error_msg = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                // Try to parse error message from JSON
                let msg = serde_json::from_str::<serde_json::Value>(&error_msg)
                    .ok()
                    .and_then(|v| v.get("error")?.get("message")?.as_str().map(String::from))
                    .unwrap_or(error_msg);
                LLMTestResult {
                    success: false,
                    message: msg,
                }
            }
        }
        Err(e) => LLMTestResult {
            success: false,
            message: format!("Connection failed: {}", e),
        },
    }
}

async fn test_anthropic(client: &reqwest::Client, request: &LLMTestRequest) -> LLMTestResult {
    let url = format!("{}/v1/messages", request.base_url);
    
    let body = serde_json::json!({
        "model": request.model,
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Hello"}]
    });
    
    match client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("x-api-key", &request.api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                LLMTestResult {
                    success: true,
                    message: "Connection successful!".to_string(),
                }
            } else {
                let error_msg = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                let msg = serde_json::from_str::<serde_json::Value>(&error_msg)
                    .ok()
                    .and_then(|v| v.get("error")?.get("message")?.as_str().map(String::from))
                    .unwrap_or(error_msg);
                LLMTestResult {
                    success: false,
                    message: msg,
                }
            }
        }
        Err(e) => LLMTestResult {
            success: false,
            message: format!("Connection failed: {}", e),
        },
    }
}

async fn test_openai_responses(client: &reqwest::Client, request: &LLMTestRequest) -> LLMTestResult {
    let url = format!("{}/responses", request.base_url);
    
    let body = serde_json::json!({
        "model": request.model,
        "input": "Hello"
    });
    
    match client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", request.api_key))
        .json(&body)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                LLMTestResult {
                    success: true,
                    message: "Connection successful!".to_string(),
                }
            } else {
                let error_msg = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                let msg = serde_json::from_str::<serde_json::Value>(&error_msg)
                    .ok()
                    .and_then(|v| v.get("error")?.get("message")?.as_str().map(String::from))
                    .unwrap_or(error_msg);
                LLMTestResult {
                    success: false,
                    message: msg,
                }
            }
        }
        Err(e) => LLMTestResult {
            success: false,
            message: format!("Connection failed: {}", e),
        },
    }
}

// ========== File Save Commands ==========

/// Save content to a file (with file dialog)
#[tauri::command]
pub async fn save_file_with_dialog(
    app_handle: AppHandle,
    content: String,
    default_name: String,
    filter_name: String,
    filter_extensions: Vec<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let extensions: Vec<&str> = filter_extensions.iter().map(|s| s.as_str()).collect();
    
    let file_path = app_handle
        .dialog()
        .file()
        .add_filter(&filter_name, &extensions)
        .set_file_name(&default_name)
        .blocking_save_file();
    
    match file_path {
        Some(file_path) => {
            if let Some(path) = file_path.as_path() {
                let path_str = path.to_string_lossy().to_string();
                std::fs::write(&path_str, &content)
                    .map_err(|e| format!("Failed to write file: {}", e))?;
                Ok(Some(path_str))
            } else {
                Err("Invalid file path".to_string())
            }
        }
        None => Ok(None),
    }
}

// ========== Skill Creation Commands ==========

/// Request to create a new skill
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSkillRequest {
    /// Skill name (1-64 chars, lowercase alphanumeric and hyphens)
    pub name: String,
    /// Description of what the skill does and when to use it (1-1024 chars)
    pub description: String,
    /// Optional license information
    pub license: Option<String>,
    /// Whether to create scripts directory
    pub include_scripts: bool,
    /// Whether to create references directory
    pub include_references: bool,
    /// Whether to create assets directory
    pub include_assets: bool,
}

/// Result of skill creation
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSkillResult {
    /// The created skill
    pub skill: Skill,
    /// Path to the created skill directory
    pub skill_dir: String,
}

/// Validate skill name according to Agent Skills spec
fn validate_skill_name(name: &str) -> Result<(), String> {
    // Check length (1-64 characters)
    if name.is_empty() {
        return Err("Skill name cannot be empty".to_string());
    }
    if name.len() > 64 {
        return Err(format!("Skill name is too long ({} characters). Maximum is 64 characters.", name.len()));
    }
    
    // Check format (lowercase alphanumeric and hyphens only)
    if !name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Skill name must contain only lowercase letters, digits, and hyphens".to_string());
    }
    
    // Check for invalid hyphen usage
    if name.starts_with('-') || name.ends_with('-') {
        return Err("Skill name cannot start or end with a hyphen".to_string());
    }
    if name.contains("--") {
        return Err("Skill name cannot contain consecutive hyphens".to_string());
    }
    
    Ok(())
}

/// Validate skill description according to Agent Skills spec
fn validate_skill_description(description: &str) -> Result<(), String> {
    // Check length (1-1024 characters)
    if description.is_empty() {
        return Err("Skill description cannot be empty".to_string());
    }
    if description.len() > 1024 {
        return Err(format!("Skill description is too long ({} characters). Maximum is 1024 characters.", description.len()));
    }
    
    // Check for angle brackets
    if description.contains('<') || description.contains('>') {
        return Err("Skill description cannot contain angle brackets (< or >)".to_string());
    }
    
    Ok(())
}

/// Generate SKILL.md content from template
fn generate_skill_md_content(name: &str, description: &str, license: Option<&str>) -> String {
    let title = name.split('-')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    
    let license_line = license
        .map(|l| format!("\nlicense: {}", l))
        .unwrap_or_default();
    
    format!(r#"---
name: {}
description: {}{}
---

# {}

## Overview

[TODO: 1-2 sentences explaining what this skill enables]

## Workflow

[TODO: Describe the workflow or process this skill provides]

## Resources

This skill may include the following resource directories:

### scripts/
Executable code (Python/Bash/etc.) that can be run directly to perform specific operations.

### references/
Documentation and reference material intended to be loaded into context to inform Claude's process and thinking.

### assets/
Files not intended to be loaded into context, but rather used within the output Claude produces.

---

**Delete any unneeded directories.** Not every skill requires all three types of resources.
"#, name, description, license_line, title)
}

/// Generate example script content
fn generate_example_script(name: &str) -> String {
    format!(r#"#!/usr/bin/env python3
"""
Example helper script for {}

This is a placeholder script that can be executed directly.
Replace with actual implementation or delete if not needed.
"""

def main():
    print("This is an example script for {}")
    # TODO: Add actual script logic here

if __name__ == "__main__":
    main()
"#, name, name)
}

/// Generate example reference content
fn generate_example_reference(title: &str) -> String {
    format!(r#"# Reference Documentation for {}

This is a placeholder for detailed reference documentation.
Replace with actual reference content or delete if not needed.

## When Reference Docs Are Useful

Reference docs are ideal for:
- Comprehensive API documentation
- Detailed workflow guides
- Complex multi-step processes
- Information too lengthy for main SKILL.md

## Structure Suggestions

### API Reference Example
- Overview
- Authentication
- Endpoints with examples
- Error codes

### Workflow Guide Example
- Prerequisites
- Step-by-step instructions
- Common patterns
- Troubleshooting
"#, title)
}

/// Generate example asset placeholder
fn generate_example_asset() -> String {
    r#"# Example Asset File

This placeholder represents where asset files would be stored.
Replace with actual asset files (templates, images, fonts, etc.) or delete if not needed.

Asset files are NOT intended to be loaded into context, but rather used within
the output Claude produces.

## Common Asset Types

- Templates: .pptx, .docx, boilerplate directories
- Images: .png, .jpg, .svg, .gif
- Fonts: .ttf, .otf, .woff, .woff2
- Boilerplate code: Project directories, starter files
- Data files: .csv, .json, .xml, .yaml

Note: This is a text placeholder. Actual assets can be any file type.
"#.to_string()
}

/// Create a new skill with the standard directory structure
#[tauri::command]
pub async fn create_skill(
    request: CreateSkillRequest,
    library_state: State<'_, LibraryState>,
) -> Result<CreateSkillResult, String> {
    // Validate inputs
    validate_skill_name(&request.name)?;
    validate_skill_description(&request.description)?;
    
    // Get library path
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };
    
    // Create skill directory
    let skill_dir = library_path.join(&request.name);
    if skill_dir.exists() {
        return Err(format!("A skill with name '{}' already exists", request.name));
    }
    
    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;
    
    // Generate and write SKILL.md
    let skill_md_content = generate_skill_md_content(
        &request.name,
        &request.description,
        request.license.as_deref(),
    );
    let skill_md_path = skill_dir.join("SKILL.md");
    std::fs::write(&skill_md_path, &skill_md_content)
        .map_err(|e| format!("Failed to write SKILL.md: {}", e))?;
    
    // Create title for display
    let title = request.name.split('-')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    
    // Create optional directories with example files
    if request.include_scripts {
        let scripts_dir = skill_dir.join("scripts");
        std::fs::create_dir_all(&scripts_dir)
            .map_err(|e| format!("Failed to create scripts directory: {}", e))?;
        
        let example_script = scripts_dir.join("example.py");
        std::fs::write(&example_script, generate_example_script(&request.name))
            .map_err(|e| format!("Failed to write example script: {}", e))?;
        
        // Make script executable on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&example_script)
                .map_err(|e| e.to_string())?
                .permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&example_script, perms)
                .map_err(|e| format!("Failed to set script permissions: {}", e))?;
        }
    }
    
    if request.include_references {
        let references_dir = skill_dir.join("references");
        std::fs::create_dir_all(&references_dir)
            .map_err(|e| format!("Failed to create references directory: {}", e))?;
        
        let example_reference = references_dir.join("api_reference.md");
        std::fs::write(&example_reference, generate_example_reference(&title))
            .map_err(|e| format!("Failed to write example reference: {}", e))?;
    }
    
    if request.include_assets {
        let assets_dir = skill_dir.join("assets");
        std::fs::create_dir_all(&assets_dir)
            .map_err(|e| format!("Failed to create assets directory: {}", e))?;
        
        let example_asset = assets_dir.join("example_asset.txt");
        std::fs::write(&example_asset, generate_example_asset())
            .map_err(|e| format!("Failed to write example asset: {}", e))?;
    }
    
    // Create skill from directory
    let skill = create_skill_from_directory(&skill_dir, None, Some(&library_path))?;

    Ok(CreateSkillResult {
        skill,
        skill_dir: skill_dir.to_string_lossy().to_string(),
    })
}

/// Validate a skill name without creating it
#[tauri::command]
pub async fn validate_skill_name_cmd(name: String) -> Result<(), String> {
    validate_skill_name(&name)
}

/// Rewrite the `name:` field inside a SKILL.md's YAML frontmatter so it matches
/// the (sanitized) directory name.
///
/// Why this exists: the Agent Skills spec requires `name` to match the directory.
/// Our import paths must sanitize the upstream name (defence against path traversal,
/// invalid chars, etc.), which means the directory name and the frontmatter name can
/// disagree. Rather than silently accepting that inconsistency, we patch the
/// frontmatter so downstream tools — and our own scanner — see a coherent skill.
///
/// On any parse error this returns `Err`. Callers must have already verified the
/// content has valid frontmatter (via `parse_front_matter`) before calling this.
fn rewrite_skill_md_name(content: &str, new_name: &str) -> Result<String, String> {
    let after_open = content
        .strip_prefix("---\n")
        .or_else(|| content.strip_prefix("---\r\n"))
        .ok_or("SKILL.md must start with --- frontmatter")?;

    let (close_idx, close_marker_len) = if let Some(i) = after_open.find("\n---\n") {
        (i, 5)
    } else if let Some(i) = after_open.find("\n---\r\n") {
        (i, 6)
    } else {
        return Err("SKILL.md frontmatter is not closed".to_string());
    };

    let yaml_part = &after_open[..close_idx];
    let rest = &after_open[close_idx + close_marker_len..];

    let mut map = match serde_yaml::from_str::<serde_yaml::Value>(yaml_part) {
        Ok(serde_yaml::Value::Mapping(m)) => m,
        Ok(_) => return Err("SKILL.md frontmatter is not a YAML mapping".to_string()),
        Err(e) => return Err(format!("Failed to parse SKILL.md frontmatter: {}", e)),
    };

    // `Mapping::insert` updates the value in place when the key already exists,
    // preserving the original key order; otherwise it appends to the end.
    map.insert(
        serde_yaml::Value::String("name".to_string()),
        serde_yaml::Value::String(new_name.to_string()),
    );

    let new_yaml = serde_yaml::to_string(&serde_yaml::Value::Mapping(map))
        .map_err(|e| format!("Failed to serialize SKILL.md frontmatter: {}", e))?;

    // serde_yaml::to_string emits a trailing newline; assemble with the same
    // delimiter style we found on input.
    Ok(format!("---\n{}---\n{}", new_yaml, rest))
}

/// Sanitize a user/remote-supplied name into a safe skill directory name.
///
/// We accept anything as input (this is called by import paths where the upstream
/// `name` is uncontrolled — GitHub frontmatter, MCP registry entries, URL imports,
/// etc.) and produce a string that satisfies `validate_skill_name`:
/// - any path separator (`/`, `\`, `..`) is stripped first, so this is the single
///   choke-point that prevents path traversal into the library
/// - whitespace is collapsed to a single `-`
/// - non `[a-z0-9-]` characters are replaced with `-`
/// - leading/trailing/consecutive hyphens are collapsed
/// - truncated to 64 characters
///
/// Returns Err if the resulting string is empty (e.g. input was only separators).
fn sanitize_skill_name(input: &str) -> Result<String, String> {
    // Strip path separators outright so traversal sequences can never survive.
    let no_sep: String = input
        .chars()
        .filter(|&c| c != '/' && c != '\\')
        .collect::<String>()
        .replace("..", "");

    // Normalize: lowercase, collapse non [a-z0-9-] to '-'.
    let mut out = String::with_capacity(no_sep.len());
    for c in no_sep.chars() {
        let lc = c.to_ascii_lowercase();
        if lc.is_ascii_lowercase() || lc.is_ascii_digit() {
            out.push(lc);
        } else if lc == '-' || c.is_whitespace() {
            out.push('-');
        } else {
            out.push('-');
        }
    }

    // Collapse consecutive hyphens.
    let mut collapsed = String::with_capacity(out.len());
    let mut prev_hyphen = false;
    for c in out.chars() {
        if c == '-' {
            if !prev_hyphen {
                collapsed.push(c);
            }
            prev_hyphen = true;
        } else {
            collapsed.push(c);
            prev_hyphen = false;
        }
    }

    let trimmed = collapsed.trim_matches('-').to_string();
    let truncated: String = trimmed.chars().take(64).collect();
    let final_name = truncated.trim_end_matches('-').to_string();

    if final_name.is_empty() {
        return Err(format!(
            "Cannot derive a valid skill name from '{}'. Please rename it.",
            input
        ));
    }

    // Final sanity check against the canonical validator. This must succeed —
    // if it doesn't there's a bug in the normalisation above.
    validate_skill_name(&final_name)?;
    Ok(final_name)
}

/// Validate a skill description without creating it
#[tauri::command]
pub async fn validate_skill_description_cmd(description: String) -> Result<(), String> {
    validate_skill_description(&description)
}

/// Get skill resource content by path.
///
/// `resource_path` is treated as relative to the skill directory. We canonicalise the
/// resolved path and verify it still lives under the skill directory before reading,
/// so a malicious request like `../../etc/passwd` is rejected rather than served.
#[tauri::command]
pub async fn get_skill_resource_content(
    skill_hash: String,
    resource_path: String,
    library_state: State<'_, LibraryState>,
) -> Result<String, String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    let all_skills = get_all_skills_internal(&library_path)?;

    let skill = all_skills
        .into_iter()
        .find(|s| s.hash == skill_hash)
        .ok_or("Skill not found")?;

    let skill_dir = PathBuf::from(&skill.skill_dir);
    let full_path = resolve_inside(&skill_dir, &resource_path)?;

    if !full_path.exists() {
        return Err(format!("Resource not found: {}", resource_path));
    }

    std::fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read resource: {}", e))
}

/// Resolve `relative` against `base`, ensuring the result stays inside `base` after
/// canonicalisation. Used to defend against `..` segments in any caller-controlled
/// relative path (resource paths, script paths, MDC rule names, etc.).
fn resolve_inside(base: &std::path::Path, relative: &str) -> Result<PathBuf, String> {
    // Reject absolute paths outright — the caller is meant to pass a path relative
    // to `base`. An absolute path here is unambiguously a misuse.
    let rel = std::path::Path::new(relative);
    if rel.is_absolute() {
        return Err(format!("Path must be relative: {}", relative));
    }
    // Reject explicit traversal segments before even touching the filesystem.
    for comp in rel.components() {
        if matches!(comp, std::path::Component::ParentDir) {
            return Err(format!("Path traversal is not allowed: {}", relative));
        }
    }

    let joined = base.join(rel);

    // Canonicalise to collapse remaining `.` segments and follow symlinks; if the
    // target doesn't exist yet (e.g. callers checking before writing), fall back to
    // the literal join — the explicit ParentDir check above already covers traversal.
    let canon_target = std::fs::canonicalize(&joined).unwrap_or(joined.clone());
    let canon_base = std::fs::canonicalize(base).unwrap_or_else(|_| base.to_path_buf());

    if !canon_target.starts_with(&canon_base) {
        return Err(format!(
            "Refusing to access {}: outside of {}",
            canon_target.display(),
            canon_base.display()
        ));
    }

    Ok(joined)
}

/// Open skill directory in system file manager
#[tauri::command]
pub async fn open_skill_directory(skill_dir: String) -> Result<(), String> {
    let path = PathBuf::from(&skill_dir);
    
    if !path.exists() {
        return Err("Skill directory not found".to_string());
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ========== Sandbox Execution Commands ==========

/// Result of script execution
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionResult {
    /// Whether the execution was successful
    pub success: bool,
    /// Standard output
    pub stdout: String,
    /// Standard error output
    pub stderr: String,
    /// Exit code (if available)
    pub exit_code: Option<i32>,
    /// Execution duration in milliseconds
    pub duration_ms: u64,
}

/// Execute a script from a skill's `scripts/` directory.
///
/// Refuses to execute when:
/// - the skill is quarantined (security: the user has explicitly flagged it as untrusted)
/// - `script_path` would resolve outside `<skill_dir>/scripts/` (path traversal defence)
#[tauri::command]
pub async fn execute_skill_script(
    skill_hash: String,
    script_path: String,
    args: Vec<String>,
    env_vars: std::collections::HashMap<String, String>,
    library_state: State<'_, LibraryState>,
    db_state: State<'_, DatabaseState>,
) -> Result<ExecutionResult, String> {
    use std::time::Instant;

    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    let all_skills = get_all_skills_internal(&library_path)?;

    let skill = all_skills
        .into_iter()
        .find(|s| s.hash == skill_hash)
        .ok_or("Skill not found")?;

    // Block execution of quarantined skills. The user has explicitly marked these as
    // not-to-be-trusted, so we refuse rather than risk silently running malicious code.
    let quarantined_hashes: std::collections::HashSet<String> = db_state
        .0
        .get_quarantined_skills()
        .unwrap_or_default()
        .into_iter()
        .collect();
    let quarantined_ids: std::collections::HashSet<String> = db_state
        .0
        .get_quarantined_skill_ids()
        .unwrap_or_default()
        .into_iter()
        .collect();
    if quarantined_hashes.contains(&skill.hash) || quarantined_ids.contains(&skill.skill_id) {
        return Err("Refusing to execute scripts from a quarantined skill".to_string());
    }

    let scripts_dir = PathBuf::from(&skill.skill_dir).join("scripts");
    let full_script_path = resolve_inside(&scripts_dir, &script_path)?;

    if !full_script_path.exists() {
        return Err(format!("Script not found: {}", script_path));
    }

    // Determine the interpreter based on file extension
    let extension = full_script_path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    let start_time = Instant::now();

    let output = match extension {
        "py" => {
            // Python script
            let mut cmd = Command::new("python3");
            cmd.arg(&full_script_path);
            cmd.args(&args);
            cmd.current_dir(&skill.skill_dir);
            for (key, value) in &env_vars {
                cmd.env(key, value);
            }
            cmd.output()
        }
        "sh" | "bash" => {
            // Shell script
            let mut cmd = Command::new("bash");
            cmd.arg(&full_script_path);
            cmd.args(&args);
            cmd.current_dir(&skill.skill_dir);
            for (key, value) in &env_vars {
                cmd.env(key, value);
            }
            cmd.output()
        }
        "js" | "mjs" => {
            // Node.js script
            let mut cmd = Command::new("node");
            cmd.arg(&full_script_path);
            cmd.args(&args);
            cmd.current_dir(&skill.skill_dir);
            for (key, value) in &env_vars {
                cmd.env(key, value);
            }
            cmd.output()
        }
        "ts" => {
            // TypeScript script (using ts-node or npx tsx)
            let mut cmd = Command::new("npx");
            cmd.arg("tsx");
            cmd.arg(&full_script_path);
            cmd.args(&args);
            cmd.current_dir(&skill.skill_dir);
            for (key, value) in &env_vars {
                cmd.env(key, value);
            }
            cmd.output()
        }
        "rb" => {
            // Ruby script
            let mut cmd = Command::new("ruby");
            cmd.arg(&full_script_path);
            cmd.args(&args);
            cmd.current_dir(&skill.skill_dir);
            for (key, value) in &env_vars {
                cmd.env(key, value);
            }
            cmd.output()
        }
        _ => {
            // Try to execute directly (for executables with shebang)
            let mut cmd = Command::new(&full_script_path);
            cmd.args(&args);
            cmd.current_dir(&skill.skill_dir);
            for (key, value) in &env_vars {
                cmd.env(key, value);
            }
            cmd.output()
        }
    };

    let duration_ms = start_time.elapsed().as_millis() as u64;

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code();
            let success = output.status.success();

            Ok(ExecutionResult {
                success,
                stdout,
                stderr,
                exit_code,
                duration_ms,
            })
        }
        Err(e) => {
            Ok(ExecutionResult {
                success: false,
                stdout: String::new(),
                stderr: e.to_string(),
                exit_code: None,
                duration_ms,
            })
        }
    }
}

/// Get available scripts for a skill
#[tauri::command]
pub async fn get_skill_scripts(
    skill_hash: String,
    library_state: State<'_, LibraryState>,
) -> Result<Vec<String>, String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    let all_skills = get_all_skills_internal(&library_path)?;

    let skill = all_skills
        .into_iter()
        .find(|s| s.hash == skill_hash)
        .ok_or("Skill not found")?;

    let scripts_dir = PathBuf::from(&skill.skill_dir).join("scripts");

    if !scripts_dir.exists() {
        return Ok(vec![]);
    }

    let mut scripts = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&scripts_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    scripts.push(name.to_string());
                }
            }
        }
    }

    scripts.sort();
    Ok(scripts)
}

// ========== AI Tools Configuration Commands ==========

use crate::types::{
    AIToolsConfigSummary, ClaudeCodeConfig, CursorConfig, CursorMdcRule,
    OpenCodeConfig, ProjectConfig,
};

/// Get all AI tools configurations
#[tauri::command]
pub async fn get_ai_tools_config() -> Result<AIToolsConfigSummary, String> {
    let claude_code = get_claude_code_config_internal()?;
    let cursor = get_cursor_config_internal()?;
    let opencode = get_opencode_config_internal()?;
    
    Ok(AIToolsConfigSummary {
        claude_code,
        cursor,
        opencode,
    })
}

/// Get Claude Code configuration
#[tauri::command]
pub async fn get_claude_code_config() -> Result<ClaudeCodeConfig, String> {
    get_claude_code_config_internal()
}

fn get_claude_code_config_internal() -> Result<ClaudeCodeConfig, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Unable to determine home directory".to_string())?;
    
    // Global CLAUDE.md path: ~/.claude/CLAUDE.md
    let global_path = home_dir.join(".claude").join("CLAUDE.md");
    let global_content = if global_path.exists() {
        Some(std::fs::read_to_string(&global_path).map_err(|e| e.to_string())?)
    } else {
        None
    };
    
    Ok(ClaudeCodeConfig {
        global_content,
        global_path: Some(global_path.to_string_lossy().to_string()),
        project_configs: vec![],
    })
}

/// Save Claude Code global configuration
#[tauri::command]
pub async fn save_claude_code_config(content: String) -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Unable to determine home directory".to_string())?;
    
    let claude_dir = home_dir.join(".claude");
    if !claude_dir.exists() {
        std::fs::create_dir_all(&claude_dir).map_err(|e| e.to_string())?;
    }
    
    let global_path = claude_dir.join("CLAUDE.md");
    std::fs::write(&global_path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Get Cursor configuration
#[tauri::command]
pub async fn get_cursor_config() -> Result<CursorConfig, String> {
    get_cursor_config_internal()
}

fn get_cursor_config_internal() -> Result<CursorConfig, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Unable to determine home directory".to_string())?;
    
    // Check for legacy .cursorrules in home directory
    let legacy_path = home_dir.join(".cursorrules");
    let (legacy_rules, legacy_rules_path) = if legacy_path.exists() {
        (
            Some(std::fs::read_to_string(&legacy_path).map_err(|e| e.to_string())?),
            Some(legacy_path.to_string_lossy().to_string()),
        )
    } else {
        (None, None)
    };
    
    // Check for global Cursor rules in config
    // On macOS: ~/Library/Application Support/Cursor/User/globalStorage/cursor.rules
    // On Windows: %APPDATA%\Cursor\User\globalStorage\cursor.rules
    // On Linux: ~/.config/Cursor/User/globalStorage/cursor.rules
    let global_rules = get_cursor_global_rules();
    
    // MDC rules would be in project directories, not global
    // We'll return empty for now as we'd need a project path to scan
    let mdc_rules = vec![];
    
    Ok(CursorConfig {
        global_rules,
        legacy_rules,
        legacy_rules_path,
        mdc_rules,
    })
}

fn get_cursor_global_rules() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let home_dir = dirs::home_dir()?;
        let rules_path = home_dir
            .join("Library")
            .join("Application Support")
            .join("Cursor")
            .join("User")
            .join("globalStorage")
            .join("cursor.rules");
        if rules_path.exists() {
            return std::fs::read_to_string(&rules_path).ok();
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        if let Some(app_data) = dirs::config_dir() {
            let rules_path = app_data
                .join("Cursor")
                .join("User")
                .join("globalStorage")
                .join("cursor.rules");
            if rules_path.exists() {
                return std::fs::read_to_string(&rules_path).ok();
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        let home_dir = dirs::home_dir()?;
        let rules_path = home_dir
            .join(".config")
            .join("Cursor")
            .join("User")
            .join("globalStorage")
            .join("cursor.rules");
        if rules_path.exists() {
            return std::fs::read_to_string(&rules_path).ok();
        }
    }
    
    None
}

/// Save Cursor legacy rules (.cursorrules)
#[tauri::command]
pub async fn save_cursor_legacy_rules(content: String) -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Unable to determine home directory".to_string())?;
    
    let legacy_path = home_dir.join(".cursorrules");
    std::fs::write(&legacy_path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Scan a project directory for Cursor MDC rules
#[tauri::command]
pub async fn scan_cursor_mdc_rules(project_path: String) -> Result<Vec<CursorMdcRule>, String> {
    let project_dir = PathBuf::from(&project_path);
    let rules_dir = project_dir.join(".cursor").join("rules");
    
    if !rules_dir.exists() {
        return Ok(vec![]);
    }
    
    let mut rules = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(&rules_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "mdc" {
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            let rule = parse_mdc_rule(&path, &content);
                            rules.push(rule);
                        }
                    }
                }
            }
        }
    }
    
    rules.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(rules)
}

fn parse_mdc_rule(path: &PathBuf, content: &str) -> CursorMdcRule {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.mdc")
        .to_string();

    let (description, globs, always_apply) = extract_mdc_frontmatter(content);

    CursorMdcRule {
        name,
        path: path.to_string_lossy().to_string(),
        description,
        globs,
        always_apply,
        content: content.to_string(),
    }
}

/// Extract (description, globs, alwaysApply) from a Cursor `.mdc` rule's YAML frontmatter.
///
/// Cursor's `.mdc` files often contain unquoted glob patterns like `globs: *.ts`.
/// In YAML, a leading `*` is an alias reference, so a strict YAML parser rejects the
/// whole document. We therefore try `serde_yaml` first (correct for quoted / list /
/// multi-line input), then fall back to a simple line-oriented extractor that handles
/// the 3 known keys without YAML-level semantics. Returns `(None, None, false)` only
/// when there is no frontmatter at all.
fn extract_mdc_frontmatter(content: &str) -> (Option<String>, Option<String>, bool) {
    // Must start with `---` followed by a newline.
    let after_open = match content
        .strip_prefix("---\n")
        .or_else(|| content.strip_prefix("---\r\n"))
    {
        Some(rest) => rest,
        None => return (None, None, false),
    };

    // Find closing `---` on its own line.
    let close_idx = match after_open
        .find("\n---\n")
        .or_else(|| after_open.find("\n---\r\n"))
        .or_else(|| if after_open.trim_end() == "---" { Some(0) } else { None })
    {
        Some(i) => i,
        None => return (None, None, false),
    };

    let yaml_str = &after_open[..close_idx];

    // First attempt: strict YAML. Handles quoted strings, list values for `globs`,
    // booleans, etc. Falls back to line-oriented extraction on failure.
    if let Ok(serde_yaml::Value::Mapping(map)) = serde_yaml::from_str::<serde_yaml::Value>(yaml_str)
    {
        return mapping_to_mdc_fields(&map);
    }

    extract_mdc_fields_line_based(yaml_str)
}

/// Convert a parsed YAML mapping to (description, globs, alwaysApply).
fn mapping_to_mdc_fields(
    map: &serde_yaml::Mapping,
) -> (Option<String>, Option<String>, bool) {
    let yaml_value_to_string = |v: &serde_yaml::Value| -> Option<String> {
        match v {
            serde_yaml::Value::String(s) => Some(s.clone()),
            serde_yaml::Value::Bool(b) => Some(b.to_string()),
            serde_yaml::Value::Number(n) => Some(n.to_string()),
            serde_yaml::Value::Sequence(seq) => {
                let parts: Vec<String> = seq
                    .iter()
                    .filter_map(|x| match x {
                        serde_yaml::Value::String(s) => Some(s.clone()),
                        _ => None,
                    })
                    .collect();
                if parts.is_empty() {
                    None
                } else {
                    Some(parts.join(", "))
                }
            }
            _ => None,
        }
    };

    let description = map
        .get(serde_yaml::Value::String("description".to_string()))
        .and_then(yaml_value_to_string);
    let globs = map
        .get(serde_yaml::Value::String("globs".to_string()))
        .and_then(yaml_value_to_string);
    let always_apply = map
        .get(serde_yaml::Value::String("alwaysApply".to_string()))
        .map(|v| match v {
            serde_yaml::Value::Bool(b) => *b,
            serde_yaml::Value::String(s) => s.eq_ignore_ascii_case("true"),
            _ => false,
        })
        .unwrap_or(false);

    (description, globs, always_apply)
}

/// Robust fallback parser for Cursor `.mdc` frontmatter when strict YAML fails (e.g.
/// unquoted `*.ts` globs that YAML interprets as alias references). Only recognises
/// the three documented top-level keys; values are taken verbatim up to end of line
/// with surrounding ASCII quotes stripped.
fn extract_mdc_fields_line_based(yaml_str: &str) -> (Option<String>, Option<String>, bool) {
    let mut description = None;
    let mut globs = None;
    let mut always_apply = false;

    let strip_quotes = |s: &str| -> String {
        let trimmed = s.trim();
        if (trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2)
            || (trimmed.starts_with('\'') && trimmed.ends_with('\'') && trimmed.len() >= 2)
        {
            trimmed[1..trimmed.len() - 1].to_string()
        } else {
            trimmed.to_string()
        }
    };

    for line in yaml_str.lines() {
        let line = line.trim_start();
        if let Some(rest) = line.strip_prefix("description:") {
            description = Some(strip_quotes(rest));
        } else if let Some(rest) = line.strip_prefix("globs:") {
            let val = strip_quotes(rest);
            if !val.is_empty() {
                globs = Some(val);
            }
        } else if let Some(rest) = line.strip_prefix("alwaysApply:") {
            let val = strip_quotes(rest);
            always_apply = val.eq_ignore_ascii_case("true");
        }
    }

    (description, globs, always_apply)
}

/// Save a Cursor MDC rule file
#[tauri::command]
pub async fn save_cursor_mdc_rule(
    project_path: String,
    rule_name: String,
    content: String,
) -> Result<(), String> {
    // Reject anything that could escape the rules directory: separators, `..`, or
    // empty/dot-only names. Cursor rule files are expected to be a single component
    // like "code-style.mdc".
    if rule_name.is_empty()
        || rule_name == "."
        || rule_name == ".."
        || rule_name.contains('/')
        || rule_name.contains('\\')
        || rule_name.contains("..")
    {
        return Err(format!("Invalid rule name: {}", rule_name));
    }

    let project_dir = PathBuf::from(&project_path);
    let rules_dir = project_dir.join(".cursor").join("rules");

    if !rules_dir.exists() {
        std::fs::create_dir_all(&rules_dir).map_err(|e| e.to_string())?;
    }

    let rule_path = rules_dir.join(&rule_name);
    std::fs::write(&rule_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

/// Get OpenCode configuration
#[tauri::command]
pub async fn get_opencode_config() -> Result<OpenCodeConfig, String> {
    get_opencode_config_internal()
}

fn get_opencode_config_internal() -> Result<OpenCodeConfig, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Unable to determine home directory".to_string())?;
    
    // Global AGENTS.md path: ~/.config/opencode/AGENTS.md
    let config_dir = home_dir.join(".config").join("opencode");
    
    let global_agents_path = config_dir.join("AGENTS.md");
    let global_agents_md = if global_agents_path.exists() {
        Some(std::fs::read_to_string(&global_agents_path).map_err(|e| e.to_string())?)
    } else {
        None
    };
    
    // Global opencode.json path: ~/.config/opencode/opencode.json
    let global_config_path = config_dir.join("opencode.json");
    let global_config_json = if global_config_path.exists() {
        Some(std::fs::read_to_string(&global_config_path).map_err(|e| e.to_string())?)
    } else {
        None
    };
    
    Ok(OpenCodeConfig {
        global_agents_md,
        global_agents_path: Some(global_agents_path.to_string_lossy().to_string()),
        global_config_json,
        global_config_path: Some(global_config_path.to_string_lossy().to_string()),
        project_configs: vec![],
    })
}

/// Save OpenCode global AGENTS.md
#[tauri::command]
pub async fn save_opencode_agents_md(content: String) -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Unable to determine home directory".to_string())?;
    
    let config_dir = home_dir.join(".config").join("opencode");
    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    
    let agents_path = config_dir.join("AGENTS.md");
    std::fs::write(&agents_path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Save OpenCode global config JSON
#[tauri::command]
pub async fn save_opencode_config_json(content: String) -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Unable to determine home directory".to_string())?;
    
    let config_dir = home_dir.join(".config").join("opencode");
    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    
    let config_path = config_dir.join("opencode.json");
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Scan a project directory for project-specific config files
#[tauri::command]
pub async fn scan_project_ai_configs(project_path: String) -> Result<Vec<ProjectConfig>, String> {
    let project_dir = PathBuf::from(&project_path);
    
    if !project_dir.exists() {
        return Err("Project directory does not exist".to_string());
    }
    
    let mut configs = Vec::new();
    
    // Check for CLAUDE.md
    let claude_md = project_dir.join("CLAUDE.md");
    if claude_md.exists() {
        if let Ok(content) = std::fs::read_to_string(&claude_md) {
            let last_modified = get_file_modified_time(&claude_md);
            configs.push(ProjectConfig {
                project_path: project_path.clone(),
                config_path: claude_md.to_string_lossy().to_string(),
                content,
                last_modified,
            });
        }
    }
    
    // Check for AGENTS.md (OpenCode)
    let agents_md = project_dir.join("AGENTS.md");
    if agents_md.exists() {
        if let Ok(content) = std::fs::read_to_string(&agents_md) {
            let last_modified = get_file_modified_time(&agents_md);
            configs.push(ProjectConfig {
                project_path: project_path.clone(),
                config_path: agents_md.to_string_lossy().to_string(),
                content,
                last_modified,
            });
        }
    }
    
    // Check for .cursorrules (legacy Cursor)
    let cursorrules = project_dir.join(".cursorrules");
    if cursorrules.exists() {
        if let Ok(content) = std::fs::read_to_string(&cursorrules) {
            let last_modified = get_file_modified_time(&cursorrules);
            configs.push(ProjectConfig {
                project_path: project_path.clone(),
                config_path: cursorrules.to_string_lossy().to_string(),
                content,
                last_modified,
            });
        }
    }
    
    // Check for opencode.json
    let opencode_json = project_dir.join("opencode.json");
    if opencode_json.exists() {
        if let Ok(content) = std::fs::read_to_string(&opencode_json) {
            let last_modified = get_file_modified_time(&opencode_json);
            configs.push(ProjectConfig {
                project_path: project_path.clone(),
                config_path: opencode_json.to_string_lossy().to_string(),
                content,
                last_modified,
            });
        }
    }
    
    Ok(configs)
}

fn get_file_modified_time(path: &PathBuf) -> Option<String> {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            let duration = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
            let secs = duration.as_secs() as i64;
            format_timestamp(secs)
        })
}

/// Format a Unix epoch timestamp (seconds) as an ISO-8601 UTC string.
/// Returns "1970-01-01T00:00:00Z" if the value is out of chrono's valid range.
fn format_timestamp(secs: i64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp(secs, 0)
        .unwrap_or_else(chrono::DateTime::<chrono::Utc>::default)
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string()
}

/// Save a project-specific config file
#[tauri::command]
pub async fn save_project_config(config_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&config_path);
    
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Create a new project config file
#[tauri::command]
pub async fn create_project_config(
    project_path: String,
    config_type: String, // "claude", "cursor", "opencode"
) -> Result<ProjectConfig, String> {
    let project_dir = PathBuf::from(&project_path);
    
    if !project_dir.exists() {
        return Err("Project directory does not exist".to_string());
    }
    
    let (config_path, default_content) = match config_type.as_str() {
        "claude" => {
            let path = project_dir.join("CLAUDE.md");
            let content = r#"# Project Configuration for Claude Code

## Overview
<!-- Brief description of this project -->

## Tech Stack
<!-- List the main technologies used -->

## Key Directories
<!-- Important folder locations -->

## Standards
<!-- Coding conventions and requirements -->

## Common Commands
<!-- Frequently used bash commands -->

## Conventions
<!-- Project-specific patterns and practices -->

## Notes
<!-- Important warnings and gotchas -->
"#;
            (path, content)
        }
        "cursor" => {
            let path = project_dir.join(".cursorrules");
            let content = r#"# Cursor Rules for this Project

## Code Style
<!-- Define your coding style preferences -->

## Project Context
<!-- Provide context about the project -->

## Conventions
<!-- List project-specific conventions -->
"#;
            (path, content)
        }
        "opencode" => {
            let path = project_dir.join("AGENTS.md");
            let content = r#"# Agent Instructions for OpenCode

## Overview
<!-- Brief description of this project -->

## Tech Stack
<!-- List the main technologies used -->

## Guidelines
<!-- Coding guidelines and conventions -->

## Common Tasks
<!-- Frequently performed tasks -->
"#;
            (path, content)
        }
        _ => return Err(format!("Unknown config type: {}", config_type)),
    };
    
    std::fs::write(&config_path, default_content).map_err(|e| e.to_string())?;
    
    let last_modified = get_file_modified_time(&config_path);
    
    Ok(ProjectConfig {
        project_path,
        config_path: config_path.to_string_lossy().to_string(),
        content: default_content.to_string(),
        last_modified,
    })
}

/// Delete a project config file
#[tauri::command]
pub async fn delete_project_config(config_path: String) -> Result<(), String> {
    let path = PathBuf::from(&config_path);
    
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

// ========== CLI Configuration Commands ==========

/// Apply CLI environment variables to shell config
/// This generates shell export commands and optionally writes to shell config file
#[tauri::command]
pub async fn apply_cli_env_vars(
    env_vars: std::collections::HashMap<String, String>,
) -> Result<String, String> {
    // Generate export commands
    let mut exports = Vec::new();
    for (key, value) in &env_vars {
        exports.push(format!("export {}=\"{}\"", key, value));
    }
    
    Ok(exports.join("\n"))
}

/// Get shell config file path based on current shell
#[tauri::command]
pub fn get_shell_config_path() -> Result<ShellConfigInfo, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Unable to determine home directory".to_string())?;
    
    // Detect shell from environment
    let shell = std::env::var("SHELL").unwrap_or_default();
    let shell_name = shell.rsplit('/').next().unwrap_or("bash");
    
    let (config_path, shell_type) = match shell_name {
        "zsh" => (home_dir.join(".zshrc"), "zsh"),
        "bash" => {
            // Check for .bash_profile first (macOS), then .bashrc (Linux)
            let bash_profile = home_dir.join(".bash_profile");
            if bash_profile.exists() {
                (bash_profile, "bash")
            } else {
                (home_dir.join(".bashrc"), "bash")
            }
        }
        "fish" => (home_dir.join(".config/fish/config.fish"), "fish"),
        _ => (home_dir.join(".profile"), "sh"),
    };
    
    Ok(ShellConfigInfo {
        shell_type: shell_type.to_string(),
        config_path: config_path.to_string_lossy().to_string(),
        exists: config_path.exists(),
    })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellConfigInfo {
    pub shell_type: String,
    pub config_path: String,
    pub exists: bool,
}

/// Write CLI environment variables to shell config file
#[tauri::command]
pub async fn write_cli_to_shell_config(
    env_vars: std::collections::HashMap<String, String>,
    tool_name: String,
) -> Result<(), String> {
    let shell_info = get_shell_config_path()?;
    let config_path = PathBuf::from(&shell_info.config_path);
    
    // Read existing config
    let existing_content = if config_path.exists() {
        std::fs::read_to_string(&config_path).unwrap_or_default()
    } else {
        String::new()
    };
    
    // Generate marker comments
    let start_marker = format!("# >>> {} CLI config >>>", tool_name);
    let end_marker = format!("# <<< {} CLI config <<<", tool_name);
    
    // Generate new config block
    let mut new_block = vec![start_marker.clone()];
    // Get current timestamp
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    new_block.push(format!("# Generated by Skill Desktop (timestamp: {})", now));
    for (key, value) in &env_vars {
        if shell_info.shell_type == "fish" {
            new_block.push(format!("set -gx {} \"{}\"", key, value));
        } else {
            new_block.push(format!("export {}=\"{}\"", key, value));
        }
    }
    new_block.push(end_marker.clone());
    
    // Remove existing block if present
    let mut new_content = String::new();
    let mut skip_until_end = false;
    
    for line in existing_content.lines() {
        if line.trim() == start_marker {
            skip_until_end = true;
            continue;
        }
        if line.trim() == end_marker {
            skip_until_end = false;
            continue;
        }
        if !skip_until_end {
            new_content.push_str(line);
            new_content.push('\n');
        }
    }
    
    // Append new block
    if !new_content.ends_with('\n') && !new_content.is_empty() {
        new_content.push('\n');
    }
    new_content.push('\n');
    new_content.push_str(&new_block.join("\n"));
    new_content.push('\n');
    
    // Write back to file
    std::fs::write(&config_path, new_content).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Remove CLI config from shell config file
#[tauri::command]
pub async fn remove_cli_from_shell_config(tool_name: String) -> Result<(), String> {
    let shell_info = get_shell_config_path()?;
    let config_path = PathBuf::from(&shell_info.config_path);
    
    if !config_path.exists() {
        return Ok(());
    }
    
    let existing_content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    
    // Generate marker comments
    let start_marker = format!("# >>> {} CLI config >>>", tool_name);
    let end_marker = format!("# <<< {} CLI config <<<", tool_name);
    
    // Remove existing block
    let mut new_content = String::new();
    let mut skip_until_end = false;
    let mut prev_was_empty = false;
    
    for line in existing_content.lines() {
        if line.trim() == start_marker {
            skip_until_end = true;
            continue;
        }
        if line.trim() == end_marker {
            skip_until_end = false;
            continue;
        }
        if !skip_until_end {
            // Avoid multiple consecutive empty lines
            let is_empty = line.trim().is_empty();
            if is_empty && prev_was_empty {
                continue;
            }
            prev_was_empty = is_empty;
            new_content.push_str(line);
            new_content.push('\n');
        }
    }
    
    // Write back to file
    std::fs::write(&config_path, new_content).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Generate Gemini CLI settings.json content
#[tauri::command]
pub fn generate_gemini_config(api_key: String, model: Option<String>) -> Result<String, String> {
    let config = serde_json::json!({
        "apiKey": api_key,
        "model": model.unwrap_or_else(|| "gemini-2.0-flash".to_string()),
    });
    
    serde_json::to_string_pretty(&config).map_err(|e| e.to_string())
}

/// Write Gemini CLI config to ~/.gemini/settings.json
#[tauri::command]
pub async fn write_gemini_config(api_key: String, model: Option<String>) -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Unable to determine home directory".to_string())?;
    
    let gemini_dir = home_dir.join(".gemini");
    if !gemini_dir.exists() {
        std::fs::create_dir_all(&gemini_dir).map_err(|e| e.to_string())?;
    }
    
    let config_path = gemini_dir.join("settings.json");
    let config_content = generate_gemini_config(api_key, model)?;
    
    std::fs::write(&config_path, config_content).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Generate OpenCode config JSON content
#[tauri::command]
pub fn generate_opencode_cli_config(
    provider: String,
    _api_key: String, // API key is stored in auth.json, not config
    base_url: Option<String>,
    model: Option<String>,
) -> Result<String, String> {
    let mut config = serde_json::json!({
        "provider": provider,
    });
    
    if let Some(url) = base_url {
        config["baseURL"] = serde_json::Value::String(url);
    }
    
    if let Some(m) = model {
        config["model"] = serde_json::Value::String(m);
    }
    
    // Note: API key should be stored in auth.json, not config
    serde_json::to_string_pretty(&config).map_err(|e| e.to_string())
}

/// Write OpenCode config to ~/.config/opencode/opencode.json
#[tauri::command]
pub async fn write_opencode_cli_config(
    provider: String,
    base_url: Option<String>,
    model: Option<String>,
) -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Unable to determine home directory".to_string())?;
    
    let opencode_dir = home_dir.join(".config").join("opencode");
    if !opencode_dir.exists() {
        std::fs::create_dir_all(&opencode_dir).map_err(|e| e.to_string())?;
    }
    
    let config_path = opencode_dir.join("opencode.json");
    
    // Read existing config if present
    let mut config: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    
    // Update config
    config["provider"] = serde_json::Value::String(provider);
    if let Some(url) = base_url {
        config["baseURL"] = serde_json::Value::String(url);
    }
    if let Some(m) = model {
        config["model"] = serde_json::Value::String(m);
    }
    
    let config_content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, config_content).map_err(|e| e.to_string())?;
    
    Ok(())
}


#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn save_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("Failed to write file: {}", e))
}

// ========== Install to AI Tool ==========

/// Supported install targets. Each maps to a well-known skills directory used by
/// a particular AI coding tool, plus the cross-tool `agents-standard` convention.
#[derive(Debug, Clone, Copy)]
enum InstallTargetKind {
    AgentsStandard,
    Claude,
    Cursor,
    Codex,
    Gemini,
    Custom,
}

impl InstallTargetKind {
    fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "agents" | "agents-standard" => Ok(Self::AgentsStandard),
            "claude" => Ok(Self::Claude),
            "cursor" => Ok(Self::Cursor),
            "codex" => Ok(Self::Codex),
            "gemini" => Ok(Self::Gemini),
            "custom" => Ok(Self::Custom),
            other => Err(format!("Unknown install target: {}", other)),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::AgentsStandard => "agents",
            Self::Claude => "claude",
            Self::Cursor => "cursor",
            Self::Codex => "codex",
            Self::Gemini => "gemini",
            Self::Custom => "custom",
        }
    }

    /// Default skills directory for this target (None for Custom).
    fn default_path(self) -> Option<PathBuf> {
        let home = dirs::home_dir()?;
        let p = match self {
            Self::AgentsStandard => home.join(".agents").join("skills"),
            Self::Claude => home.join(".claude").join("skills"),
            Self::Cursor => home.join(".cursor").join("skills"),
            Self::Codex => home.join(".codex").join("skills"),
            Self::Gemini => home.join(".gemini").join("skills"),
            Self::Custom => return None,
        };
        Some(p)
    }
}

/// Information about an install target, returned to the frontend for display.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallTargetInfo {
    pub kind: String,
    pub label: String,
    pub default_path: Option<String>,
}

/// Get the list of well-known install targets and their default paths.
#[tauri::command]
pub async fn list_install_targets() -> Result<Vec<InstallTargetInfo>, String> {
    let targets = [
        (InstallTargetKind::AgentsStandard, "Agent Skills standard (~/.agents/skills/)"),
        (InstallTargetKind::Claude, "Claude Code (~/.claude/skills/)"),
        (InstallTargetKind::Cursor, "Cursor (~/.cursor/skills/)"),
        (InstallTargetKind::Codex, "OpenAI Codex (~/.codex/skills/)"),
        (InstallTargetKind::Gemini, "Gemini CLI (~/.gemini/skills/)"),
        (InstallTargetKind::Custom, "Custom path"),
    ];

    Ok(targets
        .into_iter()
        .map(|(k, label)| InstallTargetInfo {
            kind: k.as_str().to_string(),
            label: label.to_string(),
            default_path: k.default_path().map(|p| p.to_string_lossy().to_string()),
        })
        .collect())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSkillResult {
    pub skill_id: String,
    pub target_kind: String,
    pub target_path: String,
    pub linked_path: String,
}

/// Install a skill to an AI tool's skills directory by creating a symlink.
/// The link is named after the skill's directory name (Agent Skills convention).
#[tauri::command]
pub async fn install_skill_to_tool(
    skill_id: String,
    target_kind: String,
    custom_path: Option<String>,
    library_state: State<'_, LibraryState>,
    db_state: State<'_, DatabaseState>,
) -> Result<InstallSkillResult, String> {
    let kind = InstallTargetKind::from_str(&target_kind)?;

    // Resolve target path
    let target_path = resolve_install_target_path(kind, custom_path.as_deref())?;

    // Find the skill on disk
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };

    // Refuse to install into the library itself: the skill is already discoverable
    // there, and creating a symlink would either fail (real dir already exists at
    // <library>/<skill-name>) or — for an unrelated custom path equal to the library —
    // cause the scanner to double-count it.
    let target_canon = std::fs::canonicalize(&target_path).unwrap_or_else(|_| target_path.clone());
    let library_canon =
        std::fs::canonicalize(&library_path).unwrap_or_else(|_| library_path.clone());
    if target_canon == library_canon {
        return Err(
            "Target directory is the same as the library directory; the skill is already there"
                .to_string(),
        );
    }

    let all = get_all_skills_internal(&library_path)?;
    let skill = all
        .into_iter()
        .find(|s| s.skill_id == skill_id)
        .ok_or_else(|| format!("Skill not found: {}", skill_id))?;

    let skill_dir = PathBuf::from(&skill.skill_dir);
    if !skill_dir.exists() {
        return Err(format!("Skill directory missing: {}", skill_dir.display()));
    }

    // Ensure target directory exists
    std::fs::create_dir_all(&target_path)
        .map_err(|e| format!("Failed to create target directory: {}", e))?;

    // Link name = skill directory basename (this is what the AI tool will see)
    let link_name = skill_dir
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .ok_or("Cannot determine skill directory name")?;
    let linked_path = target_path.join(&link_name);

    // Use the shared symlink helper which handles existing links / cross-platform.
    crate::space::create_symlink(&skill_dir, &linked_path)?;

    // Persist installation record
    db_state.0.record_installation(
        &skill_id,
        kind.as_str(),
        &target_path.to_string_lossy(),
        &linked_path.to_string_lossy(),
    )?;

    Ok(InstallSkillResult {
        skill_id,
        target_kind: kind.as_str().to_string(),
        target_path: target_path.to_string_lossy().to_string(),
        linked_path: linked_path.to_string_lossy().to_string(),
    })
}

/// Remove a previously created install symlink. Idempotent: missing link is not an error.
#[tauri::command]
pub async fn uninstall_skill_from_tool(
    skill_id: String,
    linked_path: String,
    target_path: String,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    let path = PathBuf::from(&linked_path);

    // Safety: only remove symlinks, never real files/directories.
    if path.exists() || path.is_symlink() {
        if !path.is_symlink() {
            return Err(format!(
                "Refusing to remove {}: not a symlink",
                path.display()
            ));
        }
        #[cfg(windows)]
        {
            if path.metadata().map(|m| m.is_dir()).unwrap_or(false) {
                std::fs::remove_dir(&path).map_err(|e| e.to_string())?;
            } else {
                std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
        }
        #[cfg(unix)]
        {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }

    db_state.0.remove_installation(&skill_id, &target_path)?;
    Ok(())
}

/// List all skill installations across all targets, optionally filtered by skill_id.
#[tauri::command]
pub async fn list_skill_installations(
    skill_id: Option<String>,
    db_state: State<'_, DatabaseState>,
) -> Result<Vec<crate::database::SkillInstallation>, String> {
    if let Some(id) = skill_id {
        db_state.0.list_installations_for_skill(&id)
    } else {
        db_state.0.list_all_installations()
    }
}

/// Resolve the target installation directory for a kind, honoring `custom_path` for Custom.
fn resolve_install_target_path(kind: InstallTargetKind, custom_path: Option<&str>) -> Result<PathBuf, String> {
    match kind {
        InstallTargetKind::Custom => {
            let p = custom_path.ok_or("Custom target requires custom_path")?;
            let trimmed = p.trim();
            if trimmed.is_empty() {
                return Err("custom_path cannot be empty".to_string());
            }
            Ok(PathBuf::from(trimmed))
        }
        other => other.default_path().ok_or_else(|| "Cannot determine home directory".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- parse_mdc_rule (extract_mdc_frontmatter) ----

    #[test]
    fn test_mdc_frontmatter_basic() {
        let content = "---\ndescription: A test rule\nglobs: *.ts\nalwaysApply: true\n---\n\n# Body\n";
        let (desc, globs, always) = extract_mdc_frontmatter(content);
        assert_eq!(desc.as_deref(), Some("A test rule"));
        assert_eq!(globs.as_deref(), Some("*.ts"));
        assert!(always);
    }

    #[test]
    fn test_mdc_frontmatter_quoted_values() {
        // Old hand-rolled parser would include the quotes; serde_yaml strips them correctly.
        let content =
            "---\ndescription: \"My : rule, with comma\"\nglobs: \"src/**/*.tsx\"\nalwaysApply: false\n---\n";
        let (desc, globs, always) = extract_mdc_frontmatter(content);
        assert_eq!(desc.as_deref(), Some("My : rule, with comma"));
        assert_eq!(globs.as_deref(), Some("src/**/*.tsx"));
        assert!(!always);
    }

    #[test]
    fn test_mdc_frontmatter_globs_as_list() {
        // A common community convention: globs as a YAML list. The old parser broke on this.
        let content = "---\ndescription: list rule\nglobs:\n  - \"*.ts\"\n  - \"*.tsx\"\nalwaysApply: false\n---\n";
        let (desc, globs, always) = extract_mdc_frontmatter(content);
        assert_eq!(desc.as_deref(), Some("list rule"));
        assert_eq!(globs.as_deref(), Some("*.ts, *.tsx"));
        assert!(!always);
    }

    #[test]
    fn test_mdc_frontmatter_no_frontmatter() {
        let content = "# Just a markdown file, no frontmatter";
        let (desc, globs, always) = extract_mdc_frontmatter(content);
        assert!(desc.is_none());
        assert!(globs.is_none());
        assert!(!always);
    }

    #[test]
    fn test_mdc_frontmatter_malformed_yaml() {
        // Old parser would panic on slicing; new parser returns defaults gracefully.
        let content = "---\nthis is not: : valid: yaml\n: :\n---\n";
        let (desc, globs, always) = extract_mdc_frontmatter(content);
        assert!(desc.is_none());
        assert!(globs.is_none());
        assert!(!always);
    }

    #[test]
    fn test_mdc_frontmatter_always_apply_string() {
        // alwaysApply may be quoted "true" rather than a bare boolean.
        let content = "---\ndescription: x\nalwaysApply: \"true\"\n---\n";
        let (_, _, always) = extract_mdc_frontmatter(content);
        assert!(always);
    }

    #[test]
    fn test_mdc_frontmatter_unquoted_glob_star() {
        // Real-world Cursor .mdc files often write `globs: *.ts` without quotes.
        // YAML treats `*.ts` as an alias reference, so strict parsing fails.
        // Our line-based fallback must still extract the fields.
        let content =
            "---\ndescription: TS files\nglobs: *.ts\nalwaysApply: true\n---\n\n# Body\n";
        let (desc, globs, always) = extract_mdc_frontmatter(content);
        assert_eq!(desc.as_deref(), Some("TS files"));
        assert_eq!(globs.as_deref(), Some("*.ts"));
        assert!(always);
    }

    #[test]
    fn test_mdc_frontmatter_unquoted_glob_brace() {
        // `{ts,tsx}` starts with `{` which YAML treats as a flow mapping. Same fallback.
        let content =
            "---\ndescription: TS/TSX\nglobs: src/**/*.{ts,tsx}\nalwaysApply: false\n---\n";
        let (desc, globs, _) = extract_mdc_frontmatter(content);
        assert_eq!(desc.as_deref(), Some("TS/TSX"));
        assert_eq!(globs.as_deref(), Some("src/**/*.{ts,tsx}"));
    }

    // ---- resolve_install_target_path ----

    #[test]
    fn test_resolve_install_target_custom_requires_path() {
        let err = resolve_install_target_path(InstallTargetKind::Custom, None);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("custom_path"));
    }

    #[test]
    fn test_resolve_install_target_custom_rejects_empty() {
        let err = resolve_install_target_path(InstallTargetKind::Custom, Some(""));
        assert!(err.is_err());
        // Also trims whitespace.
        let err2 = resolve_install_target_path(InstallTargetKind::Custom, Some("   "));
        assert!(err2.is_err());
    }

    #[test]
    fn test_resolve_install_target_custom_accepts_path() {
        let path = resolve_install_target_path(
            InstallTargetKind::Custom,
            Some("/tmp/my-skills"),
        );
        assert!(path.is_ok());
        assert_eq!(path.unwrap().to_string_lossy(), "/tmp/my-skills");
    }

    // ---- InstallTargetKind round trip ----

    #[test]
    fn test_install_target_kind_round_trip() {
        for s in &["agents", "claude", "cursor", "codex", "gemini", "custom"] {
            let kind = InstallTargetKind::from_str(s).expect("parses");
            assert_eq!(kind.as_str(), *s);
        }
        // Backward-compatible alias.
        assert_eq!(
            InstallTargetKind::from_str("agents-standard").unwrap().as_str(),
            "agents"
        );
        assert!(InstallTargetKind::from_str("unknown").is_err());
    }

    // ---- delete_skill_directory safety ----

    #[test]
    fn test_delete_skill_directory_refuses_outside_library() {
        let library = std::env::temp_dir().join("skill-desktop-test-lib-1");
        let outside = std::env::temp_dir().join("skill-desktop-test-outside-1");
        let _ = std::fs::create_dir_all(&library);
        let _ = std::fs::create_dir_all(&outside);

        let err = delete_skill_directory(&outside, &library);
        assert!(err.is_err(), "deleting path outside library must fail");
        // Cleanup
        let _ = std::fs::remove_dir_all(&library);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn test_delete_skill_directory_refuses_library_root_itself() {
        let library = std::env::temp_dir().join("skill-desktop-test-lib-2");
        let _ = std::fs::create_dir_all(&library);

        let err = delete_skill_directory(&library, &library);
        assert!(
            err.is_err(),
            "deleting the library root itself must be rejected"
        );
        let _ = std::fs::remove_dir_all(&library);
    }

    // ---- rewrite_skill_md_name ----

    #[test]
    fn test_rewrite_skill_md_name_basic() {
        let input = "---\nname: old-name\ndescription: A skill\n---\n\n# Body\n";
        let out = rewrite_skill_md_name(input, "new-name").unwrap();
        // Parse the result back and check the name is updated.
        let parsed = crate::scanner::parse_front_matter(&out).expect("parses");
        assert_eq!(parsed.name, "new-name");
        // Description must be preserved.
        assert_eq!(parsed.description, "A skill");
        // Body content must be preserved.
        assert!(out.contains("# Body"));
    }

    #[test]
    fn test_rewrite_skill_md_name_traversal_payload() {
        // If the upstream content has a `name` like "../escape", after rewrite
        // the new on-disk file must carry the sanitized name verbatim.
        let input = "---\nname: \"../escape\"\ndescription: x\n---\n\nbody\n";
        let out = rewrite_skill_md_name(input, "escape").unwrap();
        let parsed = crate::scanner::parse_front_matter(&out).expect("parses");
        assert_eq!(parsed.name, "escape");
    }

    #[test]
    fn test_rewrite_skill_md_name_no_frontmatter() {
        let input = "# Just a markdown file, no frontmatter";
        let err = rewrite_skill_md_name(input, "anything");
        assert!(err.is_err());
    }

    #[test]
    fn test_rewrite_skill_md_name_appends_when_absent() {
        // If `name:` isn't present in the frontmatter, we should add it rather than fail.
        let input = "---\ndescription: only desc\n---\n\nbody\n";
        let out = rewrite_skill_md_name(input, "my-skill").unwrap();
        let parsed = crate::scanner::parse_front_matter(&out).expect("parses");
        assert_eq!(parsed.name, "my-skill");
        assert_eq!(parsed.description, "only desc");
    }

    // ---- sanitize_skill_name ----

    #[test]
    fn test_sanitize_skill_name_basic() {
        assert_eq!(sanitize_skill_name("My Cool Skill").unwrap(), "my-cool-skill");
    }

    #[test]
    fn test_sanitize_skill_name_strips_path_separators() {
        // The whole point of this function: never allow path traversal into the library.
        assert_eq!(sanitize_skill_name("../etc/passwd").unwrap(), "etcpasswd");
        assert_eq!(sanitize_skill_name("..\\evil").unwrap(), "evil");
        assert_eq!(sanitize_skill_name("../../").is_err(), true);
        assert_eq!(sanitize_skill_name("/").is_err(), true);
    }

    #[test]
    fn test_sanitize_skill_name_collapses_specials() {
        // `/` is stripped (not replaced) so traversal sequences leave no separator,
        // which is why "server/v2" collapses to "serverv2" rather than "server-v2".
        assert_eq!(
            sanitize_skill_name("MCP@server/v2.0!").unwrap(),
            "mcp-serverv2-0"
        );
    }

    #[test]
    fn test_sanitize_skill_name_invalid_chars_become_hyphens() {
        // Non-separator special characters (spaces, punctuation other than `/`,`\`)
        // get replaced with a single hyphen and consecutive hyphens collapse.
        assert_eq!(
            sanitize_skill_name("hello, world! v1.2").unwrap(),
            "hello-world-v1-2"
        );
    }

    #[test]
    fn test_sanitize_skill_name_collapses_hyphens() {
        assert_eq!(sanitize_skill_name("--a--b--").unwrap(), "a-b");
    }

    #[test]
    fn test_sanitize_skill_name_truncates_to_64() {
        let long = "a".repeat(200);
        let s = sanitize_skill_name(&long).unwrap();
        assert!(s.len() <= 64, "got len {}", s.len());
        assert!(s.chars().all(|c| c == 'a'));
    }

    #[test]
    fn test_sanitize_skill_name_rejects_empty() {
        assert!(sanitize_skill_name("").is_err());
        assert!(sanitize_skill_name("   ").is_err());
        assert!(sanitize_skill_name("///").is_err());
    }

    // ---- resolve_inside ----

    #[test]
    fn test_resolve_inside_accepts_simple_subpath() {
        let base = std::env::temp_dir().join("skill-desktop-test-inside-1");
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("a.txt"), "x").unwrap();
        let r = resolve_inside(&base, "a.txt").unwrap();
        assert!(r.ends_with("a.txt"));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_resolve_inside_rejects_parent_dir() {
        let base = std::env::temp_dir().join("skill-desktop-test-inside-2");
        std::fs::create_dir_all(&base).unwrap();
        let r = resolve_inside(&base, "../escape");
        assert!(r.is_err(), "must reject ParentDir component");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_resolve_inside_rejects_absolute() {
        let base = std::env::temp_dir().join("skill-desktop-test-inside-3");
        std::fs::create_dir_all(&base).unwrap();
        let r = resolve_inside(&base, "/etc/passwd");
        assert!(r.is_err(), "must reject absolute paths");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_resolve_inside_allows_nested_subdir() {
        let base = std::env::temp_dir().join("skill-desktop-test-inside-4");
        let nested = base.join("scripts").join("util");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("x.py"), "").unwrap();
        let r = resolve_inside(&base, "scripts/util/x.py").unwrap();
        assert!(r.ends_with("x.py"));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_delete_skill_directory_removes_nested_skill() {
        let library = std::env::temp_dir().join("skill-desktop-test-lib-3");
        let skill = library.join("my-skill");
        let nested = skill.join("scripts");
        std::fs::create_dir_all(&nested).expect("setup");
        std::fs::write(skill.join("SKILL.md"), "---\nname: x\n---\n").expect("setup");
        std::fs::write(nested.join("run.py"), "print(1)").expect("setup");

        let res = delete_skill_directory(&skill, &library);
        assert!(res.is_ok(), "delete should succeed: {:?}", res);
        assert!(!skill.exists(), "entire skill dir must be gone, including scripts/");
        let _ = std::fs::remove_dir_all(&library);
    }
}
