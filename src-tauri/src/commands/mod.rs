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

/// Get default paths based on Tauri's app data directory
/// The skill library is stored under {app_data_dir}/data/skills
#[tauri::command]
pub fn get_default_paths(app_handle: AppHandle) -> Result<DefaultPaths, String> {
    // Get Tauri's app data directory
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Skill library is stored under {app_data_dir}/data/skills
    let data_path = app_data_dir.join("data");
    let skill_path = data_path.join("skills");
    let config_path = app_data_dir.join("config");

    // Determine OS name
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

/// Ensure the default skill directory exists and return the path
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
    
    // Enrich with categories
    if let Ok(categories) = db_state.0.get_skill_categories() {
        for skill in &mut skills {
            if let Some(cat) = categories.get(&skill.hash) {
                skill.category = Some(cat.clone());
            }
        }
    }

    Ok(skills)
}

/// Set skill category
#[tauri::command]
pub async fn set_skill_category(
    hash: String,
    category: String,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    db_state.0.set_skill_category(&hash, &category)?;
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
pub async fn rescan_library(library_state: State<'_, LibraryState>) -> Result<usize, String> {
    let skills = get_all_skills(library_state).await?;
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

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs() as i64;
    
    // Calculate date components correctly
    // Days since epoch
    let days = secs / 86400;
    let time_secs = secs % 86400;
    
    // Calculate year, month, day using a proper algorithm
    let mut year = 1970;
    let mut remaining_days = days;
    
    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }
    
    let is_leap = is_leap_year(year);
    let days_in_months: [i64; 12] = if is_leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    
    let mut month = 1;
    for days_in_month in days_in_months.iter() {
        if remaining_days < *days_in_month {
            break;
        }
        remaining_days -= days_in_month;
        month += 1;
    }
    
    let day = remaining_days + 1;
    let hour = time_secs / 3600;
    let minute = (time_secs % 3600) / 60;
    let second = time_secs % 60;
    
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, minute, second
    )
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
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

/// Delete a skill file
#[tauri::command]
pub async fn delete_skill(
    hash: String,
    library_state: State<'_, LibraryState>,
) -> Result<(), String> {
    let all_skills = get_all_skills(library_state).await?;

    let skill = all_skills
        .into_iter()
        .find(|s| s.hash == hash)
        .ok_or("Skill not found")?;

    std::fs::remove_file(&skill.local_path).map_err(|e| e.to_string())
}

/// Delete multiple skill files
#[tauri::command]
pub async fn delete_skills_batch(
    hashes: Vec<String>,
    library_state: State<'_, LibraryState>,
) -> Result<BatchDeleteResult, String> {
    let all_skills = get_all_skills(library_state).await?;
    
    let mut deleted = 0;
    let mut failed: Vec<(String, String)> = Vec::new();
    
    for hash in hashes {
        if let Some(skill) = all_skills.iter().find(|s| s.hash == hash) {
            match std::fs::remove_file(&skill.local_path) {
                Ok(_) => deleted += 1,
                Err(e) => failed.push((skill.name.clone(), e.to_string())),
            }
        } else {
            failed.push((hash, "Skill not found".to_string()));
        }
    }
    
    Ok(BatchDeleteResult { deleted, failed })
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

/// Set quarantine status for a skill
#[tauri::command]
pub async fn set_skill_quarantine(
    hash: String,
    is_quarantined: bool,
    quarantine_state: State<'_, QuarantineState>,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    // Persist to database first
    db_state.0.set_skill_quarantine(&hash, is_quarantined)?;
    
    // Then update in-memory cache
    let mut quarantined = quarantine_state.quarantined.lock().map_err(|e| e.to_string())?;
    
    if is_quarantined {
        quarantined.insert(hash);
    } else {
        quarantined.remove(&hash);
    }
    
    Ok(())
}

/// Get quarantine status for all skills
#[tauri::command]
pub async fn get_quarantined_skills(
    quarantine_state: State<'_, QuarantineState>,
    db_state: State<'_, DatabaseState>,
) -> Result<Vec<String>, String> {
    // Try to get from database (source of truth)
    let db_quarantined = db_state.0.get_quarantined_skills()?;
    
    // Update in-memory cache
    let mut quarantined = quarantine_state.quarantined.lock().map_err(|e| e.to_string())?;
    *quarantined = db_quarantined.iter().cloned().collect();
    
    Ok(db_quarantined)
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

    // Create skill directory
    let skill_dir = library_path.join(&metadata.name);
    if skill_dir.exists() {
        return Err(format!("A skill with name '{}' already exists", metadata.name));
    }
    
    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;

    // Write SKILL.md file
    let skill_md_path = skill_dir.join("SKILL.md");
    std::fs::write(&skill_md_path, &content)
        .map_err(|e| format!("Failed to write SKILL.md: {}", e))?;

    // Create skill from directory
    create_skill_from_directory(&skill_dir, Some(url))
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

    // Get all skills
    let all_skills = get_all_skills_internal(&library_path)?;
    
    // Get visibility map from database
    let visibility_map = db_state.0.get_visibility_map(&space_id)?;
    
    // Filter to visible skills only
    let skills: Vec<_> = if visibility_map.is_empty() {
        all_skills
    } else {
        all_skills.into_iter()
            .filter(|s| visibility_map.get(&s.hash).copied().unwrap_or(false))
            .collect()
    };

    // Build MCP servers config
    let mut mcp_servers = serde_json::Map::new();

    for skill in skills {
        let server_config = serde_json::json!({
            "command": "skill-runner",
            "args": [skill.local_path],
            "env": {}
        });
        mcp_servers.insert(skill.name.clone(), server_config);
    }

    let config = serde_json::json!({
        "mcpServers": mcp_servers
    });

    serde_json::to_string_pretty(&config).map_err(|e| e.to_string())
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

    // Get all skills
    let all_skills = get_all_skills_internal(&library_path)?;
    
    // Get visibility map from database
    let visibility_map = db_state.0.get_visibility_map(&space_id)?;
    
    // Filter to visible skills only
    let skills: Vec<_> = if visibility_map.is_empty() {
        all_skills
    } else {
        all_skills.into_iter()
            .filter(|s| visibility_map.get(&s.hash).copied().unwrap_or(false))
            .collect()
    };

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

    // Get all skills
    let all_skills = get_all_skills_internal(&library_path)?;
    
    // Get visibility map from database
    let visibility_map = db_state.0.get_visibility_map(&space_id)?;
    
    // Filter to visible skills only
    let skills: Vec<_> = if visibility_map.is_empty() {
        all_skills
    } else {
        all_skills.into_iter()
            .filter(|s| visibility_map.get(&s.hash).copied().unwrap_or(false))
            .collect()
    };

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

/// Helper function to get all skills without State
/// Helper function to get all skills without State
fn get_all_skills_internal(library_path: &PathBuf) -> Result<Vec<Skill>, String> {
    if !library_path.exists() {
        return Ok(vec![]);
    }

    let mut skills = Vec::new();
    let mut visited_dirs = std::collections::HashSet::new();

    // Walk through the library directory looking for skill directories
    for entry in WalkDir::new(library_path)
        .follow_links(true)
        .into_iter()
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
                match create_skill_from_directory(skill_dir, None) {
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

/// Set skill visibility in a space
#[tauri::command]
pub async fn set_skill_visibility(
    space_id: String,
    skill_hash: String,
    is_visible: bool,
    visibility_state: State<'_, VisibilityState>,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    // Update in-memory state
    let mut guard = visibility_state.mappings.lock().map_err(|e| e.to_string())?;
    let space_skills = guard.entry(space_id.clone()).or_insert_with(std::collections::HashSet::new);
    
    if is_visible {
        space_skills.insert(skill_hash.clone());
    } else {
        space_skills.remove(&skill_hash);
    }
    
    // Persist to database
    db_state.0.set_visibility(&space_id, &skill_hash, is_visible)?;
    
    Ok(())
}

/// Get visible skills for a space
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
    
    // Get visibility map from database
    let visibility_map = db_state.0.get_visibility_map(&space_id)?;
    
    // If no visibility mapping exists for this space, return all skills (default behavior)
    if visibility_map.is_empty() {
        return Ok(all_skills);
    }
    
    // Filter to only visible skills
    let visible_skills: Vec<Skill> = all_skills
        .into_iter()
        .filter(|s| visibility_map.get(&s.hash).copied().unwrap_or(true))
        .collect();
    
    Ok(visible_skills)
}

/// Get visibility status for all skills in a space
#[tauri::command]
pub async fn get_skill_visibility_map(
    space_id: String,
    db_state: State<'_, DatabaseState>,
) -> Result<std::collections::HashMap<String, bool>, String> {
    db_state.0.get_visibility_map(&space_id)
}

/// Set visibility for multiple skills at once
#[tauri::command]
pub async fn set_bulk_skill_visibility(
    space_id: String,
    skill_hashes: Vec<String>,
    is_visible: bool,
    visibility_state: State<'_, VisibilityState>,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    // Update in-memory state
    let mut guard = visibility_state.mappings.lock().map_err(|e| e.to_string())?;
    let space_skills = guard.entry(space_id.clone()).or_insert_with(std::collections::HashSet::new);
    
    for hash in &skill_hashes {
        if is_visible {
            space_skills.insert(hash.clone());
        } else {
            space_skills.remove(hash);
        }
    }
    
    // Persist to database
    db_state.0.set_bulk_visibility(&space_id, &skill_hashes, is_visible)?;
    
    Ok(())
}

/// Initialize all skills as visible for a space
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
    let skill_hashes: Vec<String> = all_skills.iter().map(|s| s.hash.clone()).collect();
    
    // Update in-memory state
    let mut guard = visibility_state.mappings.lock().map_err(|e| e.to_string())?;
    let space_skills = guard.entry(space_id.clone()).or_insert_with(std::collections::HashSet::new);
    
    for skill in all_skills {
        space_skills.insert(skill.hash);
    }
    
    // Persist to database
    db_state.0.set_bulk_visibility(&space_id, &skill_hashes, true)?;
    
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
    let branch = branch.unwrap_or_else(|| "main".to_string());
    
    // Get library path
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };
    
    // Determine if we're importing a SKILL.md file or a directory
    let is_skill_md = path.ends_with("SKILL.md");
    let skill_dir_path = if is_skill_md {
        // Get parent directory path
        std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default()
    } else {
        path.clone()
    };
    
    // First, fetch the SKILL.md content to get the skill name
    let skill_md_path = if is_skill_md {
        path.clone()
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
    
    // Parse metadata to get skill name
    let metadata = crate::scanner::parse_front_matter(&skill_md_content)
        .ok_or("Failed to parse skill metadata")?;
    
    // Create local skill directory
    let local_skill_dir = library_path.join(&metadata.name);
    if local_skill_dir.exists() {
        return Err(format!("A skill with name '{}' already exists", metadata.name));
    }
    
    std::fs::create_dir_all(&local_skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;
    
    // Write SKILL.md
    let local_skill_md = local_skill_dir.join("SKILL.md");
    std::fs::write(&local_skill_md, &skill_md_content)
        .map_err(|e| format!("Failed to write SKILL.md: {}", e))?;
    
    // Try to import additional files from the skill directory
    let _ = import_github_skill_resources(
        &owner, &repo, &branch, &skill_dir_path, &local_skill_dir
    ).await;
    
    let source_url = format!(
        "https://github.com/{}/{}/tree/{}/{}",
        owner, repo, branch, skill_dir_path
    );
    
    create_skill_from_directory(&local_skill_dir, Some(source_url))
}

/// Helper function to import additional resources from a GitHub skill directory
async fn import_github_skill_resources(
    owner: &str,
    repo: &str,
    branch: &str,
    github_path: &str,
    local_dir: &std::path::Path,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    
    // Browse the directory
    let url = format!(
        "https://api.github.com/repos/{}/{}/contents/{}?ref={}",
        owner, repo, github_path, branch
    );
    
    let response = client
        .get(&url)
        .header("User-Agent", "Skill-Desktop/0.1.0")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch GitHub API: {}", e))?;
    
    if !response.status().is_success() {
        return Ok(()); // Silently fail for additional resources
    }
    
    let entries: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    for entry in entries {
        let name = entry["name"].as_str().unwrap_or("");
        let entry_type = entry["type"].as_str().unwrap_or("");
        let entry_path = entry["path"].as_str().unwrap_or("");
        
        // Skip SKILL.md (already imported)
        if name == "SKILL.md" {
            continue;
        }
        
        if entry_type == "dir" {
            // Create local directory and recurse
            let local_subdir = local_dir.join(name);
            let _ = std::fs::create_dir_all(&local_subdir);
            let _ = Box::pin(import_github_skill_resources(
                owner, repo, branch, entry_path, &local_subdir
            )).await;
        } else if entry_type == "file" {
            // Download file
            let raw_url = format!(
                "https://raw.githubusercontent.com/{}/{}/{}/{}",
                owner, repo, branch, entry_path
            );
            
            if let Ok(resp) = reqwest::get(&raw_url).await {
                if resp.status().is_success() {
                    if let Ok(content) = resp.bytes().await {
                        let local_file = local_dir.join(name);
                        let _ = std::fs::write(&local_file, &content);
                    }
                }
            }
        }
    }
    
    Ok(())
}

/// Import multiple skills from a GitHub directory
#[tauri::command]
pub async fn import_github_directory(
    owner: String,
    repo: String,
    path: String,
    branch: Option<String>,
    library_state: State<'_, LibraryState>,
) -> Result<ImportResult, String> {
    let branch = branch.unwrap_or_else(|| "main".to_string());
    
    // Get library path
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Library path not set")?
    };
    
    // Browse directory to get all files
    let files = browse_github_repo(owner.clone(), repo.clone(), Some(path.clone()), Some(branch.clone())).await?;
    
    let mut imported = 0;
    let mut skipped = 0;
    let mut errors: Vec<String> = Vec::new();
    
    for file in files {
        // Only process markdown files
        if file.file_type != "file" || !file.name.ends_with(".md") {
            continue;
        }
        
        // Get raw content URL
        let raw_url = format!(
            "https://raw.githubusercontent.com/{}/{}/{}/{}",
            owner, repo, branch, file.path
        );
        
        // Fetch content
        let response = match reqwest::get(&raw_url).await {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("{}: {}", file.name, e));
                continue;
            }
        };
        
        if !response.status().is_success() {
            errors.push(format!("{}: HTTP {}", file.name, response.status()));
            continue;
        }
        
        let content = match response.text().await {
            Ok(c) => c,
            Err(e) => {
                errors.push(format!("{}: {}", file.name, e));
                continue;
            }
        };
        
        // Try to parse metadata - skip files without valid front matter
        if crate::scanner::parse_front_matter(&content).is_none() {
            skipped += 1;
            continue;
        }
        
        let file_path = library_path.join(&file.name);
        
        // Skip if file already exists
        if file_path.exists() {
            skipped += 1;
            continue;
        }
        
        // Write file
        if let Err(e) = std::fs::write(&file_path, &content) {
            errors.push(format!("{}: {}", file.name, e));
            continue;
        }
        
        imported += 1;
    }
    
    Ok(ImportResult {
        imported,
        skipped,
        errors,
    })
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
    
    // Generate skill name (lowercase, hyphens)
    let skill_name = tool_name.replace(" ", "-").to_lowercase();
    
    // Create skill directory
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
    
    create_skill_from_directory(&skill_dir, Some(server_url))
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
    let params_yaml: String = if parameters.is_empty() {
        "parameters: []".to_string()
    } else {
        let params: Vec<String> = parameters.iter().map(|(name, param_type, required, desc)| {
            format!(
                "  - name: \"{}\"\n    type: \"{}\"\n    required: {}\n    description: \"{}\"",
                name, param_type, required, desc
            )
        }).collect();
        format!("parameters:\n{}", params.join("\n"))
    };
    
    format!(
        r#"---
name: "{}"
version: "1.0.0"
description: "{}"
author: "MCP Server"
tags:
  - mcp
  - imported
permissions:
  - network
{}
---

# {}

{}

## MCP Server

This skill was imported from an MCP server.

- **Server URL**: {}

## Usage

This skill can be invoked through the MCP protocol.
"#,
        name,
        description.replace("\"", "\\\""),
        params_yaml,
        name,
        description,
        server_url
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
    
    // Generate skill content
    let skill_content = generate_registry_skill_content(&entry);
    
    // Generate skill name (lowercase, hyphens)
    let skill_name = entry.name.replace(" ", "-").to_lowercase();
    
    // Create skill directory
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
    create_skill_from_directory(&skill_dir, source_url)
}

/// Generate skill content from registry entry
fn generate_registry_skill_content(entry: &McpRegistryEntry) -> String {
    let tags_yaml = if entry.tags.is_empty() {
        "tags:\n  - mcp\n  - registry".to_string()
    } else {
        let mut tags = entry.tags.clone();
        if !tags.contains(&"mcp".to_string()) {
            tags.push("mcp".to_string());
        }
        if !tags.contains(&"registry".to_string()) {
            tags.push("registry".to_string());
        }
        format!("tags:\n{}", tags.iter().map(|t| format!("  - {}", t)).collect::<Vec<_>>().join("\n"))
    };
    
    let author = entry.author.as_deref().unwrap_or("Unknown");
    let repo_section = entry.repository.as_ref()
        .map(|r| format!("- **Repository**: {}", r))
        .unwrap_or_default();
    let homepage_section = entry.homepage.as_ref()
        .map(|h| format!("- **Homepage**: {}", h))
        .unwrap_or_default();
    
    format!(
        r#"---
name: "{}"
version: "1.0.0"
description: "{}"
author: "{}"
{}
permissions:
  - network
parameters: []
---

# {}

{}

## Source

- **Registry**: {}
{}
{}

## Installation

This MCP server was imported from the {} registry. Please refer to the repository for installation instructions.
"#,
        entry.name,
        entry.description.replace("\"", "\\\""),
        author,
        tags_yaml,
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
    let skill = create_skill_from_directory(&skill_dir, None)?;
    
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

/// Validate a skill description without creating it
#[tauri::command]
pub async fn validate_skill_description_cmd(description: String) -> Result<(), String> {
    validate_skill_description(&description)
}

/// Get skill resource content by path
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
    
    let full_path = PathBuf::from(&skill.skill_dir).join(&resource_path);
    
    if !full_path.exists() {
        return Err(format!("Resource not found: {}", resource_path));
    }
    
    std::fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read resource: {}", e))
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

/// Execute a script from a skill's scripts directory
#[tauri::command]
pub async fn execute_skill_script(
    skill_hash: String,
    script_path: String,
    args: Vec<String>,
    env_vars: std::collections::HashMap<String, String>,
    library_state: State<'_, LibraryState>,
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

    let full_script_path = PathBuf::from(&skill.skill_dir).join("scripts").join(&script_path);

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
    let name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.mdc")
        .to_string();
    
    let mut description = None;
    let mut globs = None;
    let mut always_apply = false;
    
    // Parse YAML frontmatter if present
    if content.starts_with("---") {
        if let Some(end_idx) = content[3..].find("---") {
            let frontmatter = &content[3..end_idx + 3];
            for line in frontmatter.lines() {
                let line = line.trim();
                if line.starts_with("description:") {
                    description = Some(line[12..].trim().to_string());
                } else if line.starts_with("globs:") {
                    globs = Some(line[6..].trim().to_string());
                } else if line.starts_with("alwaysApply:") {
                    always_apply = line[12..].trim() == "true";
                }
            }
        }
    }
    
    CursorMdcRule {
        name,
        path: path.to_string_lossy().to_string(),
        description,
        globs,
        always_apply,
        content: content.to_string(),
    }
}

/// Save a Cursor MDC rule file
#[tauri::command]
pub async fn save_cursor_mdc_rule(
    project_path: String,
    rule_name: String,
    content: String,
) -> Result<(), String> {
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

fn format_timestamp(secs: i64) -> String {
    let days = secs / 86400;
    let time_secs = secs % 86400;
    
    let mut year = 1970;
    let mut remaining_days = days;
    
    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }
    
    let is_leap = is_leap_year(year);
    let days_in_months: [i64; 12] = if is_leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    
    let mut month = 1;
    for days_in_month in days_in_months.iter() {
        if remaining_days < *days_in_month {
            break;
        }
        remaining_days -= days_in_month;
        month += 1;
    }
    
    let day = remaining_days + 1;
    let hour = time_secs / 3600;
    let minute = (time_secs % 3600) / 60;
    let second = time_secs % 60;
    
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, minute, second
    )
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
