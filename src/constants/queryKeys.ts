/**
 * Centralized query keys for React Query
 * This helps maintain consistency and avoid typos in query keys
 */

export const QUERY_KEYS = {
  // Skills
  skills: {
    all: ["skills"] as const,
    search: (query: string) => ["skills", "search", query] as const,
    content: (hash: string | null) => ["skill-content", hash] as const,
  },

  // Library
  library: {
    path: ["library-path"] as const,
  },

  // Spaces
  spaces: {
    all: ["spaces"] as const,
    detail: (id: string | null) => ["spaces", id] as const,
    visibility: (spaceId: string | null) => ["visibility", spaceId] as const,
    visibleSkills: (spaceId: string | null) => ["visible-skills", spaceId] as const,
  },

  // Quarantine
  quarantine: {
    all: ["quarantined-skills"] as const,
  },

  // File watcher
  fileWatcher: {
    status: ["file-watcher-status"] as const,
  },

  // Import
  import: {
    github: {
      browse: (owner: string, repo: string, path?: string, branch?: string) =>
        ["github", "browse", owner, repo, path, branch] as const,
    },
  },

  // MCP
  mcp: {
    registry: {
      search: (query: string, registry?: string) =>
        ["mcp-registry", "search", query, registry] as const,
      featured: (registry?: string) =>
        ["mcp-registry", "featured", registry] as const,
      details: (serverId: string | null, registry: string | null) =>
        ["mcp-registry", "details", serverId, registry] as const,
    },
  },

  // App settings
  appSettings: {
    all: ["app-settings"] as const,
  },
} as const;
