use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Debounce window for file change events. Bulk operations like `git checkout` or
/// `npm install` can produce hundreds of notify events in a few milliseconds; we
/// coalesce events affecting the same path within this window into a single emit.
const DEBOUNCE_WINDOW: Duration = Duration::from_millis(250);

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
    /// (path, event_type) -> Instant of the last emitted notification.
    /// Used to suppress duplicate events fired within DEBOUNCE_WINDOW.
    last_emit: Arc<Mutex<HashMap<(String, String), Instant>>>,
}

impl FileWatcher {
    pub fn new() -> Self {
        Self {
            watcher: None,
            watched_path: Arc::new(Mutex::new(None)),
            last_emit: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start watching a directory
    pub fn watch(&mut self, path: PathBuf, app_handle: AppHandle) -> Result<(), String> {
        // Stop existing watcher if any
        self.stop();

        let app_handle_clone = app_handle.clone();
        let last_emit = Arc::clone(&self.last_emit);

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

                    let now = Instant::now();
                    let mut tracked = match last_emit.lock() {
                        Ok(g) => g,
                        Err(_) => return,
                    };

                    // Drop stale entries every time we go through here to keep the map bounded.
                    tracked.retain(|_, ts| now.duration_since(*ts) < DEBOUNCE_WINDOW * 4);

                    for path in skill_paths {
                        let path_str = path.to_string_lossy().to_string();
                        let key = (path_str.clone(), event_type.to_string());

                        if let Some(last) = tracked.get(&key) {
                            if now.duration_since(*last) < DEBOUNCE_WINDOW {
                                continue; // suppress: still inside debounce window
                            }
                        }
                        tracked.insert(key, now);

                        let change_event = FileChangeEvent {
                            event_type: event_type.to_string(),
                            path: path_str,
                        };

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
