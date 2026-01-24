use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, State};
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
            Err(_) => continue,
        };

        // Parse metadata
        let metadata = match parse_skill_file(path) {
            Ok(m) => m,
            Err(_) => continue,
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
    let secs = duration.as_secs();
    format!(
        "{}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        1970 + secs / 31536000,
        (secs % 31536000) / 2592000 + 1,
        (secs % 2592000) / 86400 + 1,
        (secs % 86400) / 3600,
        (secs % 3600) / 60,
        secs % 60
    )
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
    let mut guard = spaces_state.spaces.lock().map_err(|e| e.to_string())?;
    
    let space = guard
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or("Space not found")?;

    if let Some(n) = name {
        space.name = n;
    }
    if let Some(dir) = active_dir {
        // Create the directory if it doesn't exist
        let path = PathBuf::from(&dir);
        if !path.exists() {
            std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        }
        space.active_dir_path = dir;
    }
    if description.is_some() {
        space.description = description;
    }
    space.updated_at = chrono_now();

    // Persist to database
    db_state.0.update_space(space)?;

    Ok(space.clone())
}

/// Delete a space
#[tauri::command]
pub async fn delete_space(
    id: String,
    spaces_state: State<'_, SpacesState>,
    db_state: State<'_, DatabaseState>,
) -> Result<(), String> {
    let mut guard = spaces_state.spaces.lock().map_err(|e| e.to_string())?;
    
    // Check if it's the default space
    if let Some(space) = guard.iter().find(|s| s.id == id) {
        if space.is_default {
            return Err("Cannot delete the default space".to_string());
        }
    }

    let initial_len = guard.len();
    guard.retain(|s| s.id != id);

    if guard.len() == initial_len {
        return Err("Space not found".to_string());
    }

    // Persist to database
    db_state.0.delete_space(&id)?;

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

    Ok(SkillPreview {
        metadata,
        content,
        source_url: url,
    })
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
}

/// Export configuration for Claude Desktop
#[tauri::command]
pub async fn export_claude_config(
    space_id: String,
    library_state: State<'_, LibraryState>,
    spaces_state: State<'_, SpacesState>,
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
    let skills = get_all_skills_internal(&library_path)?;

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
    let skills = get_all_skills_internal(&library_path)?;

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
            Err(_) => continue,
        };

        let metadata = match parse_skill_file(path) {
            Ok(m) => m,
            Err(_) => continue,
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

/// GitHub repository info for browsing
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepoInfo {
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub path: String,
}

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
    
    Ok(SkillPreview {
        metadata,
        content,
        source_url,
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
        
        // Try to parse metadata
        let metadata = match crate::scanner::parse_front_matter(&content) {
            Some(m) => m,
            None => {
                // Skip files without valid front matter
                skipped += 1;
                continue;
            }
        };
        
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

/// MCP Server info
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInfo {
    pub name: String,
    pub url: String,
    pub description: Option<String>,
    pub status: String, // "connected", "disconnected", "error"
}

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
