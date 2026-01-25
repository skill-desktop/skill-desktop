use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameter {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String,
    pub required: bool,
    pub description: String,
    #[serde(default)]
    pub default: Option<serde_json::Value>,
}

/// Risk level for detected patterns
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

/// A detected risk pattern in code
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedRisk {
    /// Risk category (e.g., "file_delete", "network_upload", etc.)
    pub category: String,
    /// Human-readable description
    pub description: String,
    /// Risk level
    pub level: RiskLevel,
    /// Line number where detected (1-based)
    pub line: Option<usize>,
    /// The matched pattern/code snippet
    pub pattern: String,
}

/// Result of risk analysis for a skill
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskAnalysis {
    /// Overall risk level (highest of all detected risks)
    pub overall_level: Option<RiskLevel>,
    /// List of detected risks
    pub detected_risks: Vec<DetectedRisk>,
    /// Whether the file contains executable code
    pub is_executable_code: bool,
    /// File extension
    pub file_extension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub hash: String,
    pub filename: String,
    pub local_path: String,
    #[serde(default)]
    pub source_url: Option<String>,
    pub name: String,
    pub version: String,
    pub description: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub parameters: Vec<Parameter>,
    #[serde(default)]
    pub is_downloaded: bool,
    /// Whether this skill is quarantined (unstable/sensitive)
    #[serde(default)]
    pub is_quarantined: bool,
    /// Risk analysis result from code scanning
    #[serde(default)]
    pub risk_analysis: Option<RiskAnalysis>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub id: String,
    pub name: String,
    pub active_dir_path: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Metadata parsed from skill file front matter
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMetadata {
    pub name: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub parameters: Vec<Parameter>,
}

fn default_version() -> String {
    "1.0.0".to_string()
}
