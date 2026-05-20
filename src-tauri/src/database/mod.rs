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
-- Note: skill_hash is the legacy key (SHA-256 of SKILL.md content).
-- skill_id is the new stable key (relative directory path from library root).
-- New writes populate both columns for migration compatibility.
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

-- Skill Categories table
CREATE TABLE IF NOT EXISTS skill_categories (
    skill_hash TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Skill installations: tracks which skills are installed (symlinked) to which AI tools.
-- target_path is the resolved absolute install directory (e.g. ~/.claude/skills).
-- linked_path is the actual symlink path inside target_path.
CREATE TABLE IF NOT EXISTS skill_installations (
    skill_id TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_path TEXT NOT NULL,
    linked_path TEXT NOT NULL,
    installed_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (skill_id, target_path)
);

CREATE INDEX IF NOT EXISTS idx_installations_skill_id ON skill_installations(skill_id);

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

        // Run additive migrations (only add columns, never drop)
        Self::run_migrations(&conn)?;

        Ok(Self {
            path: db_path,
            conn: Mutex::new(conn),
        })
    }

    /// Add new columns to existing tables without dropping any data.
    /// Each migration step is idempotent (uses "duplicate column" detection).
    fn run_migrations(conn: &rusqlite::Connection) -> Result<(), String> {
        // Add skill_id column to the three skill-keyed tables.
        // SQLite raises "duplicate column name" if it already exists; that's expected.
        let migrations = [
            "ALTER TABLE space_skill_visibility ADD COLUMN skill_id TEXT",
            "ALTER TABLE skill_quarantine ADD COLUMN skill_id TEXT",
            "ALTER TABLE skill_categories ADD COLUMN skill_id TEXT",
        ];
        for sql in migrations {
            if let Err(e) = conn.execute(sql, []) {
                let msg = e.to_string();
                if !msg.contains("duplicate column name") {
                    return Err(format!("Migration failed for `{}`: {}", sql, msg));
                }
            }
        }

        // Indexes on the new skill_id column (idempotent via IF NOT EXISTS)
        let indexes = [
            "CREATE INDEX IF NOT EXISTS idx_visibility_skill_id ON space_skill_visibility(skill_id, space_id)",
            "CREATE INDEX IF NOT EXISTS idx_quarantine_skill_id ON skill_quarantine(skill_id)",
            "CREATE INDEX IF NOT EXISTS idx_categories_skill_id ON skill_categories(skill_id)",
        ];
        for sql in indexes {
            conn.execute(sql, []).map_err(|e| e.to_string())?;
        }

        Ok(())
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

    /// Returns visibility map keyed by skill_hash (legacy).
    /// New callers should prefer `get_visibility_map_by_id`.
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

    /// Returns visibility map keyed by skill_id (new stable identifier).
    /// Rows that don't yet have skill_id populated are skipped.
    pub fn get_visibility_map_by_id(&self, space_id: &str) -> Result<std::collections::HashMap<String, bool>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT skill_id, is_visible FROM space_skill_visibility WHERE space_id = ? AND skill_id IS NOT NULL AND skill_id != ''")
            .map_err(|e| e.to_string())?;

        let mut map = std::collections::HashMap::new();
        let rows = stmt
            .query_map([space_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, bool>(1)?))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            if let Ok((sid, visible)) = row {
                map.insert(sid, visible);
            }
        }

        Ok(map)
    }

    pub fn set_visibility(&self, space_id: &str, skill_hash: &str, is_visible: bool) -> Result<(), String> {
        self.set_visibility_full(space_id, skill_hash, None, is_visible)
    }

    /// Set visibility with both skill_hash and (optional) skill_id populated.
    pub fn set_visibility_full(
        &self,
        space_id: &str,
        skill_hash: &str,
        skill_id: Option<&str>,
        is_visible: bool,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO space_skill_visibility (space_id, skill_hash, skill_id, is_visible) VALUES (?, ?, ?, ?)",
            rusqlite::params![space_id, skill_hash, skill_id, is_visible],
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

    /// Bulk visibility update with paired (hash, id) tuples.
    pub fn set_bulk_visibility_full(
        &self,
        space_id: &str,
        entries: &[(String, Option<String>)],
        is_visible: bool,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        for (hash, sid) in entries {
            conn.execute(
                "INSERT OR REPLACE INTO space_skill_visibility (space_id, skill_hash, skill_id, is_visible) VALUES (?, ?, ?, ?)",
                rusqlite::params![space_id, hash, sid.as_deref(), is_visible],
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

    /// Returns the set of skill_ids that are quarantined.
    pub fn get_quarantined_skill_ids(&self) -> Result<Vec<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT skill_id FROM skill_quarantine WHERE skill_id IS NOT NULL AND skill_id != ''")
            .map_err(|e| e.to_string())?;

        let ids = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(ids)
    }

    pub fn set_skill_quarantine(&self, skill_hash: &str, is_quarantined: bool) -> Result<(), String> {
        self.set_skill_quarantine_full(skill_hash, None, is_quarantined)
    }

    /// Set quarantine with both skill_hash and (optional) skill_id populated.
    pub fn set_skill_quarantine_full(
        &self,
        skill_hash: &str,
        skill_id: Option<&str>,
        is_quarantined: bool,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        if is_quarantined {
            conn.execute(
                "INSERT OR REPLACE INTO skill_quarantine (skill_hash, skill_id) VALUES (?, ?)",
                rusqlite::params![skill_hash, skill_id],
            ).map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "DELETE FROM skill_quarantine WHERE skill_hash = ? OR (skill_id IS NOT NULL AND skill_id = ?)",
                rusqlite::params![skill_hash, skill_id],
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

    // ========== Categories ==========

    pub fn get_skill_categories(&self) -> Result<std::collections::HashMap<String, String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT skill_hash, category FROM skill_categories")
            .map_err(|e| e.to_string())?;
        
        let mut map = std::collections::HashMap::new();
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        
        for row in rows {
            if let Ok((hash, category)) = row {
                map.insert(hash, category);
            }
        }
        
        Ok(map)
    }

    pub fn set_skill_category(&self, skill_hash: &str, category: &str) -> Result<(), String> {
        self.set_skill_category_full(skill_hash, None, category)
    }

    /// Set category with both skill_hash and (optional) skill_id populated.
    pub fn set_skill_category_full(
        &self,
        skill_hash: &str,
        skill_id: Option<&str>,
        category: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // If category is empty, remove the record (move to default/uncategorized)
        if category.is_empty() {
            conn.execute(
                "DELETE FROM skill_categories WHERE skill_hash = ? OR (skill_id IS NOT NULL AND skill_id = ?)",
                rusqlite::params![skill_hash, skill_id],
            ).map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT OR REPLACE INTO skill_categories (skill_hash, skill_id, category, updated_at) VALUES (?, ?, ?, datetime('now'))",
                rusqlite::params![skill_hash, skill_id, category],
            ).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Returns categories keyed by skill_id (preferred).
    pub fn get_skill_categories_by_id(&self) -> Result<std::collections::HashMap<String, String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT skill_id, category FROM skill_categories WHERE skill_id IS NOT NULL AND skill_id != ''")
            .map_err(|e| e.to_string())?;

        let mut map = std::collections::HashMap::new();
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            if let Ok((sid, category)) = row {
                map.insert(sid, category);
            }
        }

        Ok(map)
    }

    // ========== Skill Installations ==========

    /// Record that a skill has been installed (symlinked) at `linked_path`
    /// within an AI tool's `target_path` directory.
    pub fn record_installation(
        &self,
        skill_id: &str,
        target_kind: &str,
        target_path: &str,
        linked_path: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO skill_installations (skill_id, target_kind, target_path, linked_path, installed_at) \
             VALUES (?, ?, ?, ?, datetime('now'))",
            rusqlite::params![skill_id, target_kind, target_path, linked_path],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Remove an installation record (called after the symlink is removed).
    pub fn remove_installation(&self, skill_id: &str, target_path: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM skill_installations WHERE skill_id = ? AND target_path = ?",
            rusqlite::params![skill_id, target_path],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// List all installations for a specific skill.
    pub fn list_installations_for_skill(&self, skill_id: &str) -> Result<Vec<SkillInstallation>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT skill_id, target_kind, target_path, linked_path, installed_at FROM skill_installations WHERE skill_id = ?")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([skill_id], |row| {
                Ok(SkillInstallation {
                    skill_id: row.get(0)?,
                    target_kind: row.get(1)?,
                    target_path: row.get(2)?,
                    linked_path: row.get(3)?,
                    installed_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }

    /// List all installations across all skills.
    pub fn list_all_installations(&self) -> Result<Vec<SkillInstallation>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT skill_id, target_kind, target_path, linked_path, installed_at FROM skill_installations ORDER BY installed_at DESC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(SkillInstallation {
                    skill_id: row.get(0)?,
                    target_kind: row.get(1)?,
                    target_path: row.get(2)?,
                    linked_path: row.get(3)?,
                    installed_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }
}

/// One record in the skill_installations table.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInstallation {
    pub skill_id: String,
    pub target_kind: String,
    pub target_path: String,
    pub linked_path: String,
    pub installed_at: String,
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
