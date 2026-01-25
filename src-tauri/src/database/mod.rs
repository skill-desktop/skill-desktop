use std::path::PathBuf;
use std::sync::Mutex;

/// SQL schema for initializing the database
pub const INIT_SCHEMA: &str = r#"
-- Spaces table: stores workspace configurations
CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    active_dir_path TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Space-Skill mapping: tracks visibility
CREATE TABLE IF NOT EXISTS space_skill_visibility (
    space_id TEXT NOT NULL,
    skill_hash TEXT NOT NULL,
    is_visible BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (space_id, skill_hash)
);

CREATE INDEX IF NOT EXISTS idx_visibility_space ON space_skill_visibility(space_id);

-- Quarantine table: tracks quarantined skills
CREATE TABLE IF NOT EXISTS skill_quarantine (
    skill_hash TEXT PRIMARY KEY,
    quarantined_at TEXT DEFAULT (datetime('now'))
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Skill version history table
CREATE TABLE IF NOT EXISTS skill_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_hash TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    version TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    change_type TEXT NOT NULL,
    changed_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_skill_history_hash ON skill_history(skill_hash);
CREATE INDEX IF NOT EXISTS idx_skill_history_name ON skill_history(skill_name);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('library_path', ''),
    ('theme', 'dark'),
    ('auto_sync', 'true');

-- Insert default space if none exists
INSERT OR IGNORE INTO spaces (id, name, active_dir_path, description, is_default)
VALUES ('default', 'Default', '', 'Default workspace', TRUE);
"#;

/// Database connection wrapper
pub struct Database {
    pub path: PathBuf,
    pub conn: Mutex<rusqlite::Connection>,
}

impl Database {
    pub fn new(app_data_dir: &PathBuf) -> Result<Self, String> {
        // Ensure directory exists
        std::fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
        
        let db_path = app_data_dir.join("skill_desktop.db");
        let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
        
        // Initialize schema
        conn.execute_batch(INIT_SCHEMA).map_err(|e| e.to_string())?;
        
        Ok(Self {
            path: db_path,
            conn: Mutex::new(conn),
        })
    }
    
    // ========== Settings ==========
    
    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?")
            .map_err(|e| e.to_string())?;
        
        let result = stmt
            .query_row([key], |row| row.get(0))
            .ok();
        
        Ok(result)
    }
    
    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))",
            [key, value],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }
    
    // ========== Spaces ==========
    
    pub fn get_all_spaces(&self) -> Result<Vec<crate::types::Space>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name, active_dir_path, description, is_default, created_at, updated_at FROM spaces ORDER BY name")
            .map_err(|e| e.to_string())?;
        
        let spaces = stmt
            .query_map([], |row| {
                Ok(crate::types::Space {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    active_dir_path: row.get(2)?,
                    description: row.get(3)?,
                    is_default: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        
        Ok(spaces)
    }
    
    pub fn create_space(&self, space: &crate::types::Space) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO spaces (id, name, active_dir_path, description, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                space.id,
                space.name,
                space.active_dir_path,
                space.description,
                space.is_default,
                space.created_at,
                space.updated_at,
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }
    
    pub fn update_space(&self, space: &crate::types::Space) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE spaces SET name = ?, active_dir_path = ?, description = ?, updated_at = ? WHERE id = ?",
            rusqlite::params![
                space.name,
                space.active_dir_path,
                space.description,
                space.updated_at,
                space.id,
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }
    
    pub fn delete_space(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM spaces WHERE id = ? AND is_default = FALSE", [id])
            .map_err(|e| e.to_string())?;
        // Also delete visibility mappings
        conn.execute("DELETE FROM space_skill_visibility WHERE space_id = ?", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    
    // ========== Visibility ==========
    
    pub fn get_visibility_map(&self, space_id: &str) -> Result<std::collections::HashMap<String, bool>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT skill_hash, is_visible FROM space_skill_visibility WHERE space_id = ?")
            .map_err(|e| e.to_string())?;
        
        let mut map = std::collections::HashMap::new();
        let rows = stmt
            .query_map([space_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, bool>(1)?))
            })
            .map_err(|e| e.to_string())?;
        
        for row in rows {
            if let Ok((hash, visible)) = row {
                map.insert(hash, visible);
            }
        }
        
        Ok(map)
    }
    
    pub fn set_visibility(&self, space_id: &str, skill_hash: &str, is_visible: bool) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO space_skill_visibility (space_id, skill_hash, is_visible) VALUES (?, ?, ?)",
            rusqlite::params![space_id, skill_hash, is_visible],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }
    
    pub fn set_bulk_visibility(&self, space_id: &str, skill_hashes: &[String], is_visible: bool) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        for hash in skill_hashes {
            conn.execute(
                "INSERT OR REPLACE INTO space_skill_visibility (space_id, skill_hash, is_visible) VALUES (?, ?, ?)",
                rusqlite::params![space_id, hash, is_visible],
            ).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    
    // ========== Quarantine ==========
    
    pub fn get_quarantined_skills(&self) -> Result<Vec<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT skill_hash FROM skill_quarantine")
            .map_err(|e| e.to_string())?;
        
        let hashes = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        
        Ok(hashes)
    }
    
    pub fn set_skill_quarantine(&self, skill_hash: &str, is_quarantined: bool) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        if is_quarantined {
            conn.execute(
                "INSERT OR REPLACE INTO skill_quarantine (skill_hash) VALUES (?)",
                [skill_hash],
            ).map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "DELETE FROM skill_quarantine WHERE skill_hash = ?",
                [skill_hash],
            ).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    
    // ========== Version History ==========
    
    pub fn add_skill_history(&self, skill_hash: &str, skill_name: &str, version: &str, content_hash: &str, change_type: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO skill_history (skill_hash, skill_name, version, content_hash, change_type) VALUES (?, ?, ?, ?, ?)",
            rusqlite::params![skill_hash, skill_name, version, content_hash, change_type],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }
    
    pub fn get_skill_history(&self, skill_hash: &str) -> Result<Vec<SkillHistoryEntry>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, skill_hash, skill_name, version, content_hash, change_type, changed_at FROM skill_history WHERE skill_hash = ? ORDER BY changed_at DESC")
            .map_err(|e| e.to_string())?;
        
        let entries = stmt
            .query_map([skill_hash], |row| {
                Ok(SkillHistoryEntry {
                    id: row.get(0)?,
                    skill_hash: row.get(1)?,
                    skill_name: row.get(2)?,
                    version: row.get(3)?,
                    content_hash: row.get(4)?,
                    change_type: row.get(5)?,
                    changed_at: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        
        Ok(entries)
    }
    
    pub fn get_all_skill_history(&self, limit: i64) -> Result<Vec<SkillHistoryEntry>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, skill_hash, skill_name, version, content_hash, change_type, changed_at FROM skill_history ORDER BY changed_at DESC LIMIT ?")
            .map_err(|e| e.to_string())?;
        
        let entries = stmt
            .query_map([limit], |row| {
                Ok(SkillHistoryEntry {
                    id: row.get(0)?,
                    skill_hash: row.get(1)?,
                    skill_name: row.get(2)?,
                    version: row.get(3)?,
                    content_hash: row.get(4)?,
                    change_type: row.get(5)?,
                    changed_at: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        
        Ok(entries)
    }
}

/// Skill history entry
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillHistoryEntry {
    pub id: i64,
    pub skill_hash: String,
    pub skill_name: String,
    pub version: String,
    pub content_hash: String,
    pub change_type: String,
    pub changed_at: String,
}
