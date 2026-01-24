use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

use crate::types::{Skill, SkillMetadata};

pub mod watcher;
pub use watcher::FileWatcher;

/// Calculate SHA-256 hash of file contents
pub fn calculate_file_hash(path: &Path) -> Result<String, std::io::Error> {
    let content = fs::read(path)?;
    let mut hasher = Sha256::new();
    hasher.update(&content);
    Ok(hex::encode(hasher.finalize()))
}

/// Check if a file is a skill file (markdown or json)
pub fn is_skill_file(path: &Path) -> bool {
    path.extension()
        .map(|ext| ext == "md" || ext == "json")
        .unwrap_or(false)
}

/// Parse YAML front matter from markdown content
pub fn parse_front_matter(content: &str) -> Option<SkillMetadata> {
    let lines: Vec<&str> = content.lines().collect();

    // Check for opening delimiter
    if lines.first() != Some(&"---") {
        return None;
    }

    // Find closing delimiter
    let end_idx = lines.iter().skip(1).position(|&line| line == "---")?;

    // Extract YAML content
    let yaml_content = lines[1..=end_idx].join("\n");

    // Parse YAML
    serde_yaml::from_str(&yaml_content).ok()
}

/// Parse a skill file and return metadata
pub fn parse_skill_file(path: &Path) -> Result<SkillMetadata, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;

    // Try to parse as markdown with front matter
    if let Some(metadata) = parse_front_matter(&content) {
        return Ok(metadata);
    }

    // Try to parse as JSON
    if path.extension().map(|e| e == "json").unwrap_or(false) {
        return serde_json::from_str(&content).map_err(|e| e.to_string());
    }

    Err("Could not parse skill file".to_string())
}

/// Create a Skill struct from file path and metadata
pub fn create_skill_from_file(
    path: &Path,
    hash: String,
    metadata: SkillMetadata,
    source_url: Option<String>,
) -> Skill {
    let now = chrono_now();
    let is_downloaded = source_url.is_some();

    Skill {
        hash,
        filename: path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default(),
        local_path: path.to_string_lossy().to_string(),
        source_url,
        name: metadata.name,
        version: metadata.version,
        description: metadata.description,
        author: metadata.author,
        tags: metadata.tags,
        permissions: metadata.permissions,
        parameters: metadata.parameters,
        is_downloaded,
        created_at: now.clone(),
        updated_at: now,
    }
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    // Format as ISO 8601
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_front_matter() {
        let content = r#"---
name: "test-skill"
version: "1.0.0"
description: "A test skill"
permissions:
  - file_read
---

# Test Skill
"#;

        let result = parse_front_matter(content);
        assert!(result.is_some());

        let metadata = result.unwrap();
        assert_eq!(metadata.name, "test-skill");
        assert_eq!(metadata.version, "1.0.0");
        assert_eq!(metadata.permissions, vec!["file_read"]);
    }

    #[test]
    fn test_no_front_matter() {
        let content = "# No front matter";
        let result = parse_front_matter(content);
        assert!(result.is_none());
    }
}
