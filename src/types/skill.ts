export interface Parameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description: string;
  default?: unknown;
}

export interface Skill {
  hash: string;
  filename: string;
  localPath: string;
  sourceUrl?: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  tags: string[];
  permissions: string[];
  parameters: Parameter[];
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
