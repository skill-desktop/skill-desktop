// ========== AI Coding Tools Configuration Types ==========

/** Supported AI coding tools */
export type AIToolType = "claudecode" | "cursor" | "opencode";

/** AI tool display info */
export interface AIToolInfo {
  id: AIToolType;
  name: string;
  description: string;
  icon: string;
  docsUrl: string;
  configFiles: string[];
}

/** Claude Code configuration (CLAUDE.md) */
export interface ClaudeCodeConfig {
  /** Global CLAUDE.md content (~/.claude/CLAUDE.md) */
  globalContent?: string;
  /** Global CLAUDE.md path */
  globalPath?: string;
  /** Project-specific CLAUDE.md files */
  projectConfigs: ProjectConfig[];
}

/** Cursor MDC rule file */
export interface CursorMdcRule {
  /** File name (e.g., "code-style.mdc") */
  name: string;
  /** Full path to the file */
  path: string;
  /** Rule description from frontmatter */
  description?: string;
  /** Glob patterns for auto-application */
  globs?: string;
  /** Whether always applied */
  alwaysApply: boolean;
  /** Full content of the file */
  content: string;
}

/** Cursor configuration (.cursor/rules/*.mdc and .cursorrules) */
export interface CursorConfig {
  /** Global rules from Cursor settings */
  globalRules?: string;
  /** Legacy .cursorrules file content */
  legacyRules?: string;
  /** Legacy .cursorrules file path */
  legacyRulesPath?: string;
  /** MDC rule files (.cursor/rules/*.mdc) */
  mdcRules: CursorMdcRule[];
}

/** OpenCode configuration (AGENTS.md and opencode.json) */
export interface OpenCodeConfig {
  /** Global AGENTS.md content (~/.config/opencode/AGENTS.md) */
  globalAgentsMd?: string;
  /** Global AGENTS.md path */
  globalAgentsPath?: string;
  /** Global opencode.json content */
  globalConfigJson?: string;
  /** Global opencode.json path */
  globalConfigPath?: string;
  /** Project-specific AGENTS.md files */
  projectConfigs: ProjectConfig[];
}

/** Project-specific configuration file */
export interface ProjectConfig {
  /** Project directory path */
  projectPath: string;
  /** Config file path */
  configPath: string;
  /** Config file content */
  content: string;
  /** Last modified timestamp */
  lastModified?: string;
}

/** Summary of all AI tools configurations */
export interface AIToolsConfigSummary {
  /** Claude Code configuration */
  claudeCode: ClaudeCodeConfig;
  /** Cursor configuration */
  cursor: CursorConfig;
  /** OpenCode configuration */
  opencode: OpenCodeConfig;
}

/** AI tool info constants */
export const AI_TOOLS: AIToolInfo[] = [
  {
    id: "claudecode",
    name: "Claude Code",
    description: "Anthropic's AI coding assistant with CLAUDE.md configuration",
    icon: "🤖",
    docsUrl: "https://docs.claude.com/en/docs/claude-code",
    configFiles: ["CLAUDE.md", "~/.claude/CLAUDE.md"],
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "AI-first code editor with .mdc rules and .cursorrules",
    icon: "⚡",
    docsUrl: "https://cursor.com/docs/context/rules",
    configFiles: [".cursor/rules/*.mdc", ".cursorrules"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "Open-source AI coding assistant with AGENTS.md configuration",
    icon: "🔓",
    docsUrl: "https://opencode.ai/docs/rules/",
    configFiles: ["AGENTS.md", "opencode.json", "~/.config/opencode/AGENTS.md"],
  },
];
