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

// Agent Skills Specification compatible types
// Reference: https://agentskills.io/specification

/**
 * Skill type that matches the Rust backend Skill struct
 * All fields use camelCase due to serde rename_all configuration
 */
export interface Skill {
  // Core identifiers
  hash: string;
  filename: string;
  localPath: string;
  sourceUrl?: string;
  
  // Required fields per Agent Skills spec
  name: string;
  description: string;
  
  // Optional fields per Agent Skills spec
  version: string;
  author?: string;
  tags: string[];
  permissions: string[];
  parameters: Parameter[];
  
  // Internal fields
  isDownloaded: boolean;
  isQuarantined: boolean;
  /** Risk analysis result from code scanning */
  riskAnalysis?: RiskAnalysis;
  createdAt: string;
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
  return /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]?$/.test(name);
}

export function validateSkillDescription(description: string): boolean {
  // 1-1024 characters
  return description.length >= 1 && description.length <= 1024;
}
