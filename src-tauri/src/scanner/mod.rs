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

    // Need at least 3 lines: opening ---, some content, closing ---
    if lines.len() < 3 {
        return None;
    }

    // Find closing delimiter (searching from line 1 onwards)
    // position() returns index relative to the iterator after skip(1)
    // So if "---" is at lines[2], position returns 1
    // We need to add 1 to get the actual index in lines
    let end_idx = lines.iter().skip(1).position(|&line| line == "---")?;
    
    // end_idx is relative to skip(1), so actual index is end_idx + 1
    // If end_idx is 0, it means the closing --- is at lines[1], which means no content
    if end_idx == 0 {
        return None;
    }
    
    // We want lines from index 1 to end_idx (exclusive of the closing ---)
    // lines[1..end_idx+1] gives us lines from 1 to end_idx (inclusive)
    let yaml_content = lines[1..end_idx + 1].join("\n");

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
        is_quarantined: false,
        created_at: now.clone(),
        updated_at: now,
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
