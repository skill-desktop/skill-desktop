export interface Parameter {
  name: string;
  type: string; // "string" | "number" | "boolean" | "object" | "array"
  required: boolean;
  description: string;
  default?: unknown;
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
  createdAt: string;
  updatedAt: string;
}

export type PermissionLevel = "low" | "medium" | "high";

export const PERMISSION_LEVELS: Record<string, PermissionLevel> = {
  file_read: "low",
  system_info: "low",
  file_write: "medium",
  network: "medium",
  shell_exec: "high",
};

export function getPermissionLevel(permission: string): PermissionLevel {
  return PERMISSION_LEVELS[permission] || "medium";
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
