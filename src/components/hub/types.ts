export type ImportSource = "url" | "github" | "mcp" | "registry";

export interface PreviewData {
  metadata: {
    name: string;
    version: string;
    description: string;
    author?: string;
    tags: string[];
    permissions: string[];
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
