export interface Parameter {
  name: string;
  type: string; // "string" | "number" | "boolean" | "object" | "array"
  required: boolean;
  description: string;
  default?: unknown;
}

// Risk analysis types
export type RiskLevel = "low" | "medium" | "high";

export interface DetectedRisk {
  /** Risk category (e.g., "file_delete", "network_upload", etc.) */
  category: string;
  /** Human-readable description */
  description: string;
  /** Risk level */
  level: RiskLevel;
  /** Line number where detected (1-based) */
  line?: number;
  /** The matched pattern/code snippet */
  pattern: string;
}

export interface RiskAnalysis {
  /** Overall risk level (highest of all detected risks) */
  overallLevel?: RiskLevel;
  /** List of detected risks */
  detectedRisks: DetectedRisk[];
  /** Whether the file contains executable code */
  isExecutableCode: boolean;
  /** File extension */
  fileExtension?: string;
}

// ========== Agent Skills Specification Types ==========
// Reference: https://agentskills.io/specification

/**
 * Resource file in a skill directory
 */
export interface SkillResource {
  /** File name */
  name: string;
  /** Relative path within the skill directory */
  path: string;
  /** Resource type: "script", "reference", "asset", or "other" */
  resourceType: string;
  /** File size in bytes */
  size: number;
  /** File extension */
  extension?: string;
}

/**
 * Skill directory resources following Agent Skills specification
 */
export interface SkillResources {
  /** Scripts - Executable code (Python/Bash/etc.) */
  scripts: SkillResource[];
  /** References - Documentation intended to be loaded into context */
  references: SkillResource[];
  /** Assets - Files used in output (templates, icons, fonts, etc.) */
  assets: SkillResource[];
  /** Other files in the skill directory (LICENSE.txt, etc.) */
  other: SkillResource[];
}

/**
 * Skill type following Agent Skills Specification
 * Reference: https://agentskills.io/specification
 * 
 * A skill is a directory containing:
 * - SKILL.md (required) - Main skill file with YAML frontmatter and instructions
 * - scripts/ (optional) - Executable code (Python/Bash/etc.)
 * - references/ (optional) - Documentation to be loaded into context
 * - assets/ (optional) - Files used in output (templates, icons, fonts, etc.)
 */
export interface Skill {
  // ========== Internal identifiers ==========
  /** SHA-256 hash of SKILL.md contents */
  hash: string;
  /** Filename (always "SKILL.md" for standard skills) */
  filename: string;
  /** Full local path to the SKILL.md file */
  localPath: string;
  /** Directory path containing the skill */
  skillDir: string;
  /** Source URL if imported from remote */
  sourceUrl?: string;
  
  // ========== Required fields per Agent Skills spec ==========
  /** Skill name (1-64 chars, lowercase alphanumeric and hyphens) */
  name: string;
  /** Description of what the skill does and when to use it (1-1024 chars) */
  description: string;
  
  // ========== Optional fields per Agent Skills spec ==========
  /** License information (e.g., "MIT", "Complete terms in LICENSE.txt") */
  license?: string;
  /** Allowed tools for this skill */
  allowedTools: string[];
  
  // ========== Extended fields (internal use) ==========
  /** Version string */
  version: string;
  /** Author name */
  author?: string;
  /** Tags for categorization */
  tags: string[];
  /** Required permissions */
  permissions: string[];
  /** Input parameters */
  parameters: Parameter[];
  
  // ========== Skill resources ==========
  /** Bundled resources (scripts, references, assets) */
  resources: SkillResources;
  
  // ========== Internal state fields ==========
  /** Whether this skill was downloaded from a remote source */
  isDownloaded: boolean;
  /** Whether this skill is quarantined (unstable/sensitive) */
  isQuarantined: boolean;
  /** Risk analysis result from code scanning */
  riskAnalysis?: RiskAnalysis;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

// Permission level type (for backward compatibility)
export type PermissionLevel = RiskLevel;

// Risk category to level mapping
export const RISK_CATEGORY_LEVELS: Record<string, RiskLevel> = {
  // High risk - destructive or privileged operations
  file_delete: "high",
  shell_exec: "high",
  privilege_escalation: "high",
  // Medium risk - network and file write operations
  network_upload: "medium",
  network_download: "medium",
  file_write: "medium",
  environment_access: "medium",
  // Low risk - read-only operations
  file_read: "low",
  system_info: "low",
};

// Permission to level mapping (for declared permissions)
export const PERMISSION_LEVELS: Record<string, PermissionLevel> = {
  file_read: "low",
  system_info: "low",
  file_write: "medium",
  network: "medium",
  shell_exec: "high",
};

/**
 * Get the risk level for a permission string
 */
export function getPermissionLevel(permission: string): PermissionLevel {
  return PERMISSION_LEVELS[permission] || "medium";
}

/**
 * Get the overall risk level for a skill, considering both declared permissions
 * and detected risks from code analysis
 */
export function getSkillRiskLevel(skill: Skill): RiskLevel {
  let highestLevel: RiskLevel = "low";
  
  // Check declared permissions
  for (const permission of skill.permissions) {
    const level = getPermissionLevel(permission);
    if (level === "high") return "high";
    if (level === "medium") highestLevel = "medium";
  }
  
  // Check detected risks from code analysis
  if (skill.riskAnalysis?.overallLevel) {
    const analysisLevel = skill.riskAnalysis.overallLevel;
    if (analysisLevel === "high") return "high";
    if (analysisLevel === "medium" && highestLevel === "low") {
      highestLevel = "medium";
    }
  }
  
  return highestLevel;
}

/**
 * Get risk level description in the user's language
 */
export function getRiskLevelKey(level: RiskLevel): string {
  switch (level) {
    case "low": return "skillDetail.lowRisk";
    case "medium": return "skillDetail.mediumRisk";
    case "high": return "skillDetail.highRisk";
  }
}

/**
 * Get risk category description key for i18n
 */
export function getRiskCategoryKey(category: string): string {
  return `riskCategory.${category}`;
}

// Skill validation based on Agent Skills spec
export function validateSkillName(name: string): boolean {
  // 1-64 characters, lowercase alphanumeric and hyphens only
  // Cannot start/end with hyphen or contain consecutive hyphens
  if (name.length < 1 || name.length > 64) return false;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]?$/.test(name)) return false;
  if (name.startsWith('-') || name.endsWith('-')) return false;
  if (name.includes('--')) return false;
  return true;
}

export function validateSkillDescription(description: string): boolean {
  // 1-1024 characters, no angle brackets
  if (description.length < 1 || description.length > 1024) return false;
  if (description.includes('<') || description.includes('>')) return false;
  return true;
}

// ========== Skill Creation Types ==========

export interface CreateSkillRequest {
  /** Skill name (1-64 chars, lowercase alphanumeric and hyphens) */
  name: string;
  /** Description of what the skill does and when to use it (1-1024 chars) */
  description: string;
  /** Optional license information */
  license?: string;
  /** Whether to create scripts directory */
  includeScripts: boolean;
  /** Whether to create references directory */
  includeReferences: boolean;
  /** Whether to create assets directory */
  includeAssets: boolean;
}

export interface CreateSkillResult {
  /** The created skill */
  skill: Skill;
  /** Path to the created skill directory */
  skillDir: string;
}
