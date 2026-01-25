/**
 * CLI Tool Configuration Types
 * 支持配置各种 AI 编码助手 CLI 工具的 API 设置
 */

/**
 * 支持的 CLI 工具类型
 */
export type CLIToolType = 
  | "claude_code"    // Claude Code CLI
  | "gemini_cli"     // Google Gemini CLI
  | "codex"          // OpenAI Codex CLI
  | "opencode"       // OpenCode CLI
  | "aider"          // Aider CLI
  | "continue"       // Continue.dev
  | "custom";        // 自定义 CLI 工具

/**
 * CLI 工具的环境变量配置
 */
export interface CLIEnvConfig {
  /** API Key 环境变量名 */
  api_key_env: string;
  /** Base URL 环境变量名 (可选) */
  base_url_env?: string;
  /** 模型环境变量名 (可选) */
  model_env?: string;
  /** 其他环境变量 */
  extra_envs?: Record<string, string>;
}

/**
 * CLI 工具配置
 */
export interface CLIToolConfig {
  /** 唯一标识符 */
  id: string;
  /** 工具类型 */
  type: CLIToolType;
  /** 显示名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** API Key */
  api_key: string;
  /** Base URL (可选) */
  base_url?: string;
  /** 默认模型 (可选) */
  default_model?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 环境变量配置 */
  env_config: CLIEnvConfig;
  /** 配置文件路径 (如果工具支持配置文件) */
  config_file_path?: string;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/**
 * CLI 配置状态
 */
export interface CLISettings {
  /** 所有配置的 CLI 工具 */
  tools: CLIToolConfig[];
  /** 是否自动应用环境变量 */
  auto_apply_env: boolean;
  /** Shell 配置文件路径 (用于持久化环境变量) */
  shell_config_path?: string;
}

/**
 * CLI 工具预设配置
 */
export const CLI_TOOL_PRESETS: Record<string, Omit<CLIToolConfig, "id" | "api_key" | "enabled" | "created_at" | "updated_at">> = {
  claude_code: {
    type: "claude_code",
    name: "Claude Code",
    description: "Anthropic's Claude Code CLI for AI-assisted coding",
    base_url: "https://api.anthropic.com",
    default_model: "claude-sonnet-4-20250514",
    env_config: {
      api_key_env: "ANTHROPIC_API_KEY",
      base_url_env: "ANTHROPIC_BASE_URL",
    },
  },
  gemini_cli: {
    type: "gemini_cli",
    name: "Gemini CLI",
    description: "Google's Gemini CLI for AI-assisted coding",
    base_url: "https://generativelanguage.googleapis.com",
    default_model: "gemini-2.0-flash",
    env_config: {
      api_key_env: "GEMINI_API_KEY",
    },
    config_file_path: "~/.gemini/settings.json",
  },
  codex: {
    type: "codex",
    name: "OpenAI Codex",
    description: "OpenAI's Codex CLI for AI-assisted coding",
    base_url: "https://api.openai.com/v1",
    default_model: "gpt-4o",
    env_config: {
      api_key_env: "OPENAI_API_KEY",
      base_url_env: "OPENAI_BASE_URL",
      model_env: "OPENAI_MODEL",
    },
  },
  opencode: {
    type: "opencode",
    name: "OpenCode",
    description: "OpenCode CLI - supports 75+ LLM providers",
    base_url: "https://api.openai.com/v1",
    default_model: "gpt-4o",
    env_config: {
      api_key_env: "OPENAI_API_KEY",
      base_url_env: "OPENAI_BASE_URL",
    },
    config_file_path: "~/.config/opencode/opencode.json",
  },
  aider: {
    type: "aider",
    name: "Aider",
    description: "Aider - AI pair programming in your terminal",
    base_url: "https://api.openai.com/v1",
    default_model: "gpt-4o",
    env_config: {
      api_key_env: "OPENAI_API_KEY",
      base_url_env: "OPENAI_API_BASE",
      model_env: "AIDER_MODEL",
      extra_envs: {
        "AIDER_ANTHROPIC_API_KEY": "",
      },
    },
  },
  continue: {
    type: "continue",
    name: "Continue.dev",
    description: "Continue - open-source AI code assistant",
    base_url: "https://api.openai.com/v1",
    default_model: "gpt-4o",
    env_config: {
      api_key_env: "OPENAI_API_KEY",
      base_url_env: "OPENAI_BASE_URL",
    },
    config_file_path: "~/.continue/config.json",
  },
};

/**
 * 创建新的 CLI 工具配置
 */
export function createCLIToolConfig(
  preset?: keyof typeof CLI_TOOL_PRESETS
): CLIToolConfig {
  const now = new Date().toISOString();
  const presetConfig = preset ? CLI_TOOL_PRESETS[preset] : undefined;

  if (presetConfig) {
    return {
      id: crypto.randomUUID(),
      ...presetConfig,
      api_key: "",
      enabled: true,
      created_at: now,
      updated_at: now,
    };
  }

  return {
    id: crypto.randomUUID(),
    type: "custom",
    name: "Custom CLI Tool",
    api_key: "",
    enabled: true,
    env_config: {
      api_key_env: "API_KEY",
    },
    created_at: now,
    updated_at: now,
  };
}

/**
 * 默认 CLI 设置
 */
export const DEFAULT_CLI_SETTINGS: CLISettings = {
  tools: [],
  auto_apply_env: false,
  shell_config_path: undefined,
};

/**
 * 获取 CLI 工具的环境变量映射
 */
export function getCLIEnvVars(config: CLIToolConfig): Record<string, string> {
  const envVars: Record<string, string> = {};

  if (config.api_key) {
    envVars[config.env_config.api_key_env] = config.api_key;
  }

  if (config.base_url && config.env_config.base_url_env) {
    envVars[config.env_config.base_url_env] = config.base_url;
  }

  if (config.default_model && config.env_config.model_env) {
    envVars[config.env_config.model_env] = config.default_model;
  }

  if (config.env_config.extra_envs) {
    Object.entries(config.env_config.extra_envs).forEach(([key, value]) => {
      if (value) {
        envVars[key] = value;
      }
    });
  }

  return envVars;
}

/**
 * 生成 shell 导出命令
 */
export function generateShellExports(configs: CLIToolConfig[]): string {
  const lines: string[] = [
    "# CLI Tool Environment Variables",
    "# Generated by Skill Desktop",
    "",
  ];

  for (const config of configs) {
    if (!config.enabled) continue;

    lines.push(`# ${config.name}`);
    const envVars = getCLIEnvVars(config);
    
    for (const [key, value] of Object.entries(envVars)) {
      lines.push(`export ${key}="${value}"`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
