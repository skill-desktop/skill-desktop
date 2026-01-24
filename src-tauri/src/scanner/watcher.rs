use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// File change event type
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEvent {
    pub event_type: String, // "created", "modified", "removed"
    pub path: String,
}

/// File watcher for monitoring library directory changes
pub struct FileWatcher {
    watcher: Option<RecommendedWatcher>,
    watched_path: Arc<Mutex<Option<PathBuf>>>,
}

impl FileWatcher {
    pub fn new() -> Self {
        Self {
            watcher: None,
            watched_path: Arc::new(Mutex::new(None)),
        }
    }

    /// Start watching a directory
    pub fn watch(&mut self, path: PathBuf, app_handle: AppHandle) -> Result<(), String> {
        // Stop existing watcher if any
        self.stop();

        let app_handle_clone = app_handle.clone();

        // Create watcher with debounce
        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            match res {
                Ok(event) => {
                    // Filter to only skill files
                    let skill_paths: Vec<_> = event
                        .paths
                        .iter()
                        .filter(|p| {
                            p.extension()
                                .map(|ext| ext == "md" || ext == "json")
                                .unwrap_or(false)
                        })
                        .collect();

                    if skill_paths.is_empty() {
                        return;
                    }

                    let event_type = match event.kind {
                        notify::EventKind::Create(_) => "created",
                        notify::EventKind::Modify(_) => "modified",
                        notify::EventKind::Remove(_) => "removed",
                        _ => return,
                    };

                    for path in skill_paths {
                        let change_event = FileChangeEvent {
                            event_type: event_type.to_string(),
                            path: path.to_string_lossy().to_string(),
                        };

                        // Emit event to frontend
                        if let Err(e) = app_handle_clone.emit("file-change", &change_event) {
                            tracing::error!("Failed to emit file-change event: {}", e);
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Watch error: {:?}", e);
                }
            }
        })
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        // Start watching
        watcher
            .watch(&path, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch path: {}", e))?;

        // Store watcher and path
        self.watcher = Some(watcher);
        if let Ok(mut guard) = self.watched_path.lock() {
            *guard = Some(path);
        }

        Ok(())
    }

    /// Stop watching
    pub fn stop(&mut self) {
        if let Some(mut watcher) = self.watcher.take() {
            if let Ok(guard) = self.watched_path.lock() {
                if let Some(path) = guard.as_ref() {
                    let _ = watcher.unwatch(path);
                }
            }
        }
        if let Ok(mut guard) = self.watched_path.lock() {
            *guard = None;
        }
    }

    /// Check if currently watching
    pub fn is_watching(&self) -> bool {
        self.watcher.is_some()
    }

    /// Get the currently watched path
    pub fn get_watched_path(&self) -> Option<PathBuf> {
        self.watched_path
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
    }
}

impl Default for FileWatcher {
    fn default() -> Self {
        Self::new()
    }
}
