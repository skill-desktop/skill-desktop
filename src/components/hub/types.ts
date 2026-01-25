export type ImportSource = "url" | "github" | "mcp" | "registry";

/**
 * Preview data for skill import
 * Follows Agent Skills specification: https://agentskills.io/specification
 */
export interface PreviewData {
  metadata: {
    /** Required: Skill name (1-64 chars, lowercase alphanumeric and hyphens) */
    name: string;
    /** Optional: Version string */
    version: string;
    /** Required: Description of what the skill does (1-1024 chars) */
    description: string;
    /** Optional: Author name */
    author?: string;
    /** Optional: License information */
    license?: string;
    /** Optional: Allowed tools */
    allowedTools?: string[];
    /** Optional: Tags for categorization */
    tags: string[];
    /** Optional: Required permissions */
    permissions: string[];
    /** Optional: Input parameters */
    parameters: Array<{
      name: string;
      type: string;
      required: boolean;
      description: string;
    }>;
  };
  content: string;
  sourceUrl: string;
}

export interface GitHubFileEntry {
  name: string;
  path: string;
  fileType: string;
  size?: number;
  downloadUrl?: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
