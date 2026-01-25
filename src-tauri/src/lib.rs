// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod database;
mod scanner;
mod space;
mod types;

use commands::{LibraryState, SpacesState, VisibilityState, QuarantineState};
use database::Database;
use scanner::FileWatcher;
use std::sync::{Arc, Mutex};
use tauri::Manager;

/// Database state wrapper
pub struct DatabaseState(pub Arc<Database>);

/// File watcher state wrapper
pub struct WatcherState(pub Mutex<FileWatcher>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .setup(|app| {
            // Get app data directory
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            
            // Initialize database
            let db = Database::new(&app_data_dir).expect("Failed to initialize database");
            
            // Load library path from database
            let library_path = db.get_setting("library_path").ok().flatten();
            
            // Load spaces from database
            let spaces = db.get_all_spaces().unwrap_or_default();
            
            // Manage database state
            app.manage(DatabaseState(Arc::new(db)));
            
            // Manage library state with loaded path
            let library_path_buf = library_path.map(std::path::PathBuf::from);
            app.manage(LibraryState {
                path: Mutex::new(library_path_buf.clone()),
            });
            
            // Manage spaces state with loaded spaces
            app.manage(SpacesState {
                spaces: Mutex::new(spaces),
            });
            
            // Manage visibility state (will be loaded on demand)
            app.manage(VisibilityState::default());
            
            // Manage quarantine state
            app.manage(QuarantineState::default());
            
            // Initialize file watcher
            let mut watcher = FileWatcher::new();
            
            // Start watching if library path is set
            if let Some(path) = library_path_buf {
                if path.exists() {
                    if let Err(e) = watcher.watch(path, app.handle().clone()) {
                        tracing::error!("Failed to start file watcher: {}", e);
                    }
                }
            }
            
            app.manage(WatcherState(Mutex::new(watcher)));
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_all_skills,
            commands::search_skills,
            commands::get_skill_content,
            commands::set_library_path,
            commands::get_library_path,
            commands::rescan_library,
            commands::get_all_spaces,
            commands::get_space,
            commands::create_space,
            commands::update_space,
            commands::delete_space,
            commands::sync_space,
            commands::delete_skill,
            commands::delete_skills_batch,
            commands::set_skill_quarantine,
            commands::get_quarantined_skills,
            commands::show_in_folder,
            commands::open_file,
            commands::preview_skill_from_url,
            commands::import_skill_from_url,
            commands::export_claude_config,
            commands::export_generic_config,
            commands::export_mcp_config,
            commands::set_skill_visibility,
            commands::get_visible_skills,
            commands::get_skill_visibility_map,
            commands::set_bulk_skill_visibility,
            commands::init_space_visibility,
            // GitHub import commands
            commands::browse_github_repo,
            commands::preview_github_skill,
            commands::import_github_skill,
            commands::import_github_directory,
            // File watcher commands
            commands::start_file_watcher,
            commands::stop_file_watcher,
            commands::is_file_watcher_running,
            // MCP commands
            commands::connect_mcp_server,
            commands::import_mcp_tool_as_skill,
            // MCP Registry commands
            commands::search_mcp_registry,
            commands::get_featured_mcp_servers,
            commands::get_mcp_server_details,
            commands::import_mcp_registry_server,
            // App settings commands
            commands::load_app_settings,
            commands::save_app_settings,
            commands::update_app_setting,
            // Batch export commands
            commands::export_skills_batch,
            commands::export_skills_batch_json,
            // Version history commands
            commands::record_skill_change,
            commands::get_skill_history,
            commands::get_recent_skill_history,
            // Update detection commands
            commands::check_skill_update,
            commands::check_all_skill_updates,
            // File save commands
            commands::save_file_with_dialog,
            // LLM commands
            commands::test_llm_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
