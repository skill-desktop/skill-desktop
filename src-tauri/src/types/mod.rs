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

/// Resource file in a skill directory
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillResource {
    /// File name
    pub name: String,
    /// Relative path within the skill directory
    pub path: String,
    /// Resource type: "script", "reference", "asset", or "other"
    pub resource_type: String,
    /// File size in bytes
    pub size: u64,
    /// File extension
    pub extension: Option<String>,
}

/// Skill directory structure following Agent Skills specification
/// Reference: https://agentskills.io/specification
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillResources {
    /// Scripts - Executable code (Python/Bash/etc.)
    pub scripts: Vec<SkillResource>,
    /// References - Documentation intended to be loaded into context
    pub references: Vec<SkillResource>,
    /// Assets - Files used in output (templates, icons, fonts, etc.)
    pub assets: Vec<SkillResource>,
    /// Other files in the skill directory (LICENSE.txt, etc.)
    pub other: Vec<SkillResource>,
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

/// Skill struct following Agent Skills Specification
/// Reference: https://agentskills.io/specification
/// 
/// A skill is a directory containing:
/// - SKILL.md (required) - Main skill file with YAML frontmatter and instructions
/// - scripts/ (optional) - Executable code (Python/Bash/etc.)
/// - references/ (optional) - Documentation to be loaded into context
/// - assets/ (optional) - Files used in output (templates, icons, fonts, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    // ========== Internal identifiers ==========
    /// Stable identifier: relative path from library root to the skill directory.
    /// Persisted in the database and does NOT change when SKILL.md content is edited.
    /// Example: "web-search" or "research/web-search".
    #[serde(default)]
    pub skill_id: String,
    /// SHA-256 hash of SKILL.md contents (content fingerprint; changes on every edit)
    pub hash: String,
    /// Filename (always "SKILL.md" for standard skills)
    pub filename: String,
    /// Full local path to the SKILL.md file
    pub local_path: String,
    /// Directory path containing the skill
    pub skill_dir: String,
    /// Source URL if imported from remote
    #[serde(default)]
    pub source_url: Option<String>,
    
    // ========== Required fields per Agent Skills spec ==========
    /// Skill name (1-64 chars, lowercase alphanumeric and hyphens)
    /// Must match directory name exactly
    pub name: String,
    /// Description of what the skill does and when to use it (1-1024 chars)
    /// Primary triggering mechanism for the skill
    pub description: String,
    
    // ========== Optional fields per Agent Skills spec ==========
    /// License information (e.g., "MIT", "Complete terms in LICENSE.txt")
    #[serde(default)]
    pub license: Option<String>,
    /// Allowed tools for this skill
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    
    // ========== Extended fields (internal use) ==========
    /// Version string
    pub version: String,
    /// Author name
    #[serde(default)]
    pub author: Option<String>,
    /// Tags for categorization
    #[serde(default)]
    pub tags: Vec<String>,
    /// Required permissions
    #[serde(default)]
    pub permissions: Vec<String>,
    /// Input parameters
    #[serde(default)]
    pub parameters: Vec<Parameter>,
    
    // ========== Skill resources ==========
    /// Bundled resources (scripts, references, assets)
    #[serde(default)]
    pub resources: SkillResources,
    
    // ========== Internal state fields ==========
    /// Whether this skill was downloaded from a remote source
    #[serde(default)]
    pub is_downloaded: bool,
    /// Whether this skill is quarantined (unstable/sensitive)
    #[serde(default)]
    pub is_quarantined: bool,
    /// Risk analysis result from code scanning
    #[serde(default)]
    pub risk_analysis: Option<RiskAnalysis>,
    /// Creation timestamp
    pub created_at: String,
    /// Last update timestamp
    pub updated_at: String,
    /// Category (optional, from database)
    #[serde(default)]
    pub category: Option<String>,
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

/// Metadata parsed from SKILL.md front matter.
/// Based on Agent Skills Specification: https://agentskills.io/specification
///
/// Spec-defined frontmatter: name, description, license, compatibility, allowed-tools, metadata.
/// Extended fields (version, author, tags, permissions, parameters) are project-internal and
/// should ideally live inside `metadata`, but we accept them at the top level for backwards
/// compatibility with existing skills.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMetadata {
    /// Required: Skill name (1-64 chars, lowercase alphanumeric and hyphens).
    /// Must match directory name exactly.
    pub name: String,
    /// Required: Description of what the skill does and when to use it (1-1024 chars).
    #[serde(default)]
    pub description: String,
    /// Optional: License information (e.g., "MIT", "Apache-2.0", "Complete terms in LICENSE.txt")
    #[serde(default)]
    pub license: Option<String>,
    /// Optional: Compatibility / environment requirements (1-500 chars).
    /// E.g. "Requires Python 3.14+ and uv", "Designed for Claude Code".
    #[serde(default)]
    pub compatibility: Option<String>,
    /// Optional: Allowed tools. Per spec this is a space-separated string, but many
    /// existing skills use a YAML list. We accept either form.
    #[serde(default, rename = "allowed-tools", deserialize_with = "deserialize_allowed_tools")]
    pub allowed_tools: Vec<String>,
    /// Optional: Additional metadata (free-form key-value map per spec).
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,

    // ========== Extended fields (not in official spec, for internal use) ==========
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub parameters: Vec<Parameter>,
}

/// Deserialize `allowed-tools` accepting either a space-separated string (spec form)
/// or a YAML/JSON list of strings (legacy form). Empty/missing yields an empty vec.
fn deserialize_allowed_tools<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::{self, Visitor};
    use std::fmt;

    struct AllowedToolsVisitor;

    impl<'de> Visitor<'de> for AllowedToolsVisitor {
        type Value = Vec<String>;

        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            f.write_str("a space-separated string or a list of strings")
        }

        fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
            Ok(v.split_whitespace().map(|s| s.to_string()).collect())
        }

        fn visit_string<E: de::Error>(self, v: String) -> Result<Self::Value, E> {
            self.visit_str(&v)
        }

        fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            let mut out = Vec::new();
            while let Some(item) = seq.next_element::<String>()? {
                out.push(item);
            }
            Ok(out)
        }

        fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(Vec::new())
        }

        fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(Vec::new())
        }
    }

    deserializer.deserialize_any(AllowedToolsVisitor)
}

fn default_version() -> String {
    "1.0.0".to_string()
}

// ========== AI Coding Tools Configuration Types ==========

/// Supported AI coding tools
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AIToolType {
    ClaudeCode,
    Cursor,
    OpenCode,
}

impl std::fmt::Display for AIToolType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AIToolType::ClaudeCode => write!(f, "Claude Code"),
            AIToolType::Cursor => write!(f, "Cursor"),
            AIToolType::OpenCode => write!(f, "OpenCode"),
        }
    }
}

/// Claude Code configuration (CLAUDE.md)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeConfig {
    /// Global CLAUDE.md content (~/.claude/CLAUDE.md)
    pub global_content: Option<String>,
    /// Global CLAUDE.md path
    pub global_path: Option<String>,
    /// Project-specific CLAUDE.md files (path -> content)
    pub project_configs: Vec<ProjectConfig>,
}

/// Cursor configuration (.cursor/rules/*.mdc and .cursorrules)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorConfig {
    /// Global rules from Cursor settings
    pub global_rules: Option<String>,
    /// Legacy .cursorrules file content
    pub legacy_rules: Option<String>,
    /// Legacy .cursorrules file path
    pub legacy_rules_path: Option<String>,
    /// MDC rule files (.cursor/rules/*.mdc)
    pub mdc_rules: Vec<CursorMdcRule>,
}

/// Cursor MDC rule file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorMdcRule {
    /// File name (e.g., "code-style.mdc")
    pub name: String,
    /// Full path to the file
    pub path: String,
    /// Rule description from frontmatter
    pub description: Option<String>,
    /// Glob patterns for auto-application
    pub globs: Option<String>,
    /// Whether always applied
    pub always_apply: bool,
    /// Full content of the file
    pub content: String,
}

/// OpenCode configuration (AGENTS.md and opencode.json)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeConfig {
    /// Global AGENTS.md content (~/.config/opencode/AGENTS.md)
    pub global_agents_md: Option<String>,
    /// Global AGENTS.md path
    pub global_agents_path: Option<String>,
    /// Global opencode.json content
    pub global_config_json: Option<String>,
    /// Global opencode.json path
    pub global_config_path: Option<String>,
    /// Project-specific AGENTS.md files
    pub project_configs: Vec<ProjectConfig>,
}

/// Project-specific configuration file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    /// Project directory path
    pub project_path: String,
    /// Config file path
    pub config_path: String,
    /// Config file content
    pub content: String,
    /// Last modified timestamp
    pub last_modified: Option<String>,
}

/// Summary of all AI tools configurations
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIToolsConfigSummary {
    /// Claude Code configuration
    pub claude_code: ClaudeCodeConfig,
    /// Cursor configuration
    pub cursor: CursorConfig,
    /// OpenCode configuration
    pub opencode: OpenCodeConfig,
}
