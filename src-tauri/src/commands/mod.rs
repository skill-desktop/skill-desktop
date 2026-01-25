use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager, State};
use walkdir::WalkDir;

use crate::scanner::{calculate_file_hash, create_skill_from_file, is_skill_file, parse_skill_file};
use crate::space::{sync_space_links, SyncResult};
use crate::types::{Skill, SkillMetadata, Space};
use crate::{DatabaseState, WatcherState};

/// State for library path
pub struct LibraryState {
    pub path: std::sync::Mutex<Option<PathBuf>>,
}

/// Get all skills from the library directory
#[tauri::command]
pub async fn get_all_skills(library_state: State<'_, LibraryState>) -> Result<Vec<Skill>, String> {
    let library_path = {
        let guard = library_state.path.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };

    let Some(library_path) = library_path else {
        return Ok(vec![]);
    };

    if !library_path.exists() {
        return Ok(vec![]);
    }

    let mut skills = Vec::new();

    for entry in WalkDir::new(&library_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if !path.is_file() || !is_skill_file(path) {
            continue;
        }

        // Calculate hash
        let hash = match calculate_file_hash(path) {
            Ok(h) => h,
            Err(e) => {
                tracing::warn!("Failed to calculate hash for {:?}: {}", path, e);
                continue;
            }
        };

        // Parse metadata
        let metadata = match parse_skill_file(path) {
            Ok(m) => m,
            Err(e) => {
                tracing::warn!("Failed to parse skill file {:?}: {}", path, e);
                continue;
            }
        };

        let skill = create_skill_from_file(path, hash, metadata, None);
        skills.push(skill);
    }

    Ok(skills)
}

/// Search skills by query
#[tauri::command]
pub async fn search_skills(
    query: String,
    library_state: State<'_, LibraryState>,
) -> Result<Vec<Skill>, String> {
    let all_skills = get_all_skills(library_state).await?;

    let query = query.to_lowercase();
    let filtered: Vec<Skill> = all_skills
        .into_iter()
        .filter(|skill| {
            skill.name.to_lowercase().contains(&query)
                || skill.description.to_lowercase().contains(&query)
                || skill.tags.iter().any(|t| t.to_lowercase().contains(&query))
        })
        .collect();

    Ok(filtered)
}

/// Get skill content by hash
#[tauri::command]
pub async fn get_skill_content(
    hash: String,
    library_state: State<'_, LibraryState>,
) -> Result<String, String> {
    let all_skills = get_all_skills(library_state).await?;

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

    // Generate filename from skill name
    let filename = format!("{}.md", metadata.name.replace(" ", "-").to_lowercase());
    let file_path = library_path.join(&filename);

    // Check if file already exists
    if file_path.exists() {
        return Err(format!("A skill with filename '{}' already exists", filename));
    }

    // Write file
    std::fs::write(&file_path, &content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Calculate hash and create skill
    let hash = calculate_file_hash(&file_path)
        .map_err(|e| format!("Failed to calculate hash: {}", e))?;

    let skill = create_skill_from_file(&file_path, hash, metadata, Some(url));

    Ok(skill)
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
fn get_all_skills_internal(library_path: &PathBuf) -> Result<Vec<Skill>, String> {
    if !library_path.exists() {
        return Ok(vec![]);
    }

    let mut skills = Vec::new();

    for entry in WalkDir::new(library_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if !path.is_file() || !is_skill_file(path) {
            continue;
        }

        let hash = match calculate_file_hash(path) {
            Ok(h) => h,
            Err(e) => {
                tracing::warn!("Failed to calculate hash for {:?}: {}", path, e);
                continue;
            }
        };

        let metadata = match parse_skill_file(path) {
            Ok(m) => m,
            Err(e) => {
                tracing::warn!("Failed to parse skill file {:?}: {}", path, e);
                continue;
            }
        };

        let skill = create_skill_from_file(path, hash, metadata, None);
        skills.push(skill);
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
        .ok_or("Failed to parse skill metadata")?;
    
    // Generate filename from path or skill name
    let filename = std::path::Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("{}.md", metadata.name.replace(" ", "-").to_lowercase()));
    
    let file_path = library_path.join(&filename);
    
    // Check if file already exists
    if file_path.exists() {
        return Err(format!("A skill with filename '{}' already exists", filename));
    }
    
    // Write file
    std::fs::write(&file_path, &content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    // Calculate hash and create skill
    let hash = calculate_file_hash(&file_path)
        .map_err(|e| format!("Failed to calculate hash: {}", e))?;
    
    let source_url = format!(
        "https://github.com/{}/{}/blob/{}/{}",
        owner, repo, branch, path
    );
    
    let skill = create_skill_from_file(&file_path, hash, metadata, Some(source_url));
    
    Ok(skill)
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
    
    // Generate filename
    let filename = format!("{}.md", tool_name.replace(" ", "-").to_lowercase());
    let file_path = library_path.join(&filename);
    
    // Check if file already exists
    if file_path.exists() {
        return Err(format!("A skill with filename '{}' already exists", filename));
    }
    
    // Write file
    std::fs::write(&file_path, &skill_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    // Calculate hash and create skill
    let hash = calculate_file_hash(&file_path)
        .map_err(|e| format!("Failed to calculate hash: {}", e))?;
    
    let metadata = crate::scanner::parse_front_matter(&skill_content)
        .ok_or("Failed to parse generated skill metadata")?;
    
    let skill = create_skill_from_file(&file_path, hash, metadata, Some(server_url));
    
    Ok(skill)
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
    
    // Generate filename
    let filename = format!("{}.md", entry.name.replace(" ", "-").to_lowercase());
    let file_path = library_path.join(&filename);
    
    // Check if file already exists
    if file_path.exists() {
        return Err(format!("A skill with filename '{}' already exists", filename));
    }
    
    // Write file
    std::fs::write(&file_path, &skill_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    // Calculate hash and create skill
    let hash = calculate_file_hash(&file_path)
        .map_err(|e| format!("Failed to calculate hash: {}", e))?;
    
    let metadata = crate::scanner::parse_front_matter(&skill_content)
        .ok_or("Failed to parse generated skill metadata")?;
    
    let source_url = entry.repository.or(entry.homepage);
    let skill = create_skill_from_file(&file_path, hash, metadata, source_url);
    
    Ok(skill)
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
