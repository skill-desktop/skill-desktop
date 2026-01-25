/**
 * LLM Provider Types
 * 支持三种类型的API接口：
 * 1. OpenAI Compatible - OpenAI Chat Completions API 兼容接口
 * 2. Anthropic - Anthropic Messages API
 * 3. OpenAI Responses - OpenAI Responses API (新版)
 */

export type LLMProviderType = "openai_compatible" | "anthropic" | "openai_responses";

/**
 * LLM Provider Configuration
 */
export interface LLMProviderConfig {
  /** 唯一标识符 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 提供商类型 */
  type: LLMProviderType;
  /** API Base URL */
  base_url: string;
  /** API Key */
  api_key: string;
  /** 默认模型 */
  default_model: string;
  /** 可用模型列表 */
  available_models: string[];
  /** 是否启用 */
  enabled: boolean;
  /** 是否为默认提供商 */
  is_default: boolean;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/**
 * LLM Settings State
 */
export interface LLMSettings {
  /** 所有配置的提供商 */
  providers: LLMProviderConfig[];
  /** 默认提供商ID */
  default_provider_id: string | null;
}

/**
 * Chat Message Role
 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/**
 * Chat Message
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string;
}

/**
 * Tool Definition (for function calling)
 */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * LLM Request Options
 */
export interface LLMRequestOptions {
  /** 使用的提供商ID，不指定则使用默认 */
  provider_id?: string;
  /** 使用的模型，不指定则使用提供商默认模型 */
  model?: string;
  /** 消息列表 */
  messages: ChatMessage[];
  /** 温度参数 (0-2) */
  temperature?: number;
  /** 最大token数 */
  max_tokens?: number;
  /** Top P 采样 */
  top_p?: number;
  /** 是否流式返回 */
  stream?: boolean;
  /** 停止序列 */
  stop?: string[];
  /** 工具定义 (function calling) */
  tools?: ToolDefinition[];
}

/**
 * LLM Response
 */
export interface LLMResponse {
  /** 响应ID */
  id: string;
  /** 模型名称 */
  model: string;
  /** 生成的内容 */
  content: string;
  /** 完成原因 */
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  /** 工具调用 */
  tool_calls?: ToolCall[];
  /** Token使用统计 */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Tool Call
 */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Stream Chunk
 */
export interface LLMStreamChunk {
  /** 增量内容 */
  delta: string;
  /** 是否完成 */
  done: boolean;
  /** 完成原因 */
  finish_reason?: "stop" | "length" | "tool_calls" | "content_filter";
}

/**
 * Provider presets for quick setup
 */
export const PROVIDER_PRESETS: Record<string, Partial<LLMProviderConfig>> = {
  openai: {
    name: "OpenAI",
    type: "openai_compatible",
    base_url: "https://api.openai.com/v1",
    default_model: "gpt-4o",
    available_models: [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4",
      "gpt-3.5-turbo",
    ],
  },
  anthropic: {
    name: "Anthropic",
    type: "anthropic",
    base_url: "https://api.anthropic.com",
    default_model: "claude-sonnet-4-20250514",
    available_models: [
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
  },
  openai_responses: {
    name: "OpenAI Responses",
    type: "openai_responses",
    base_url: "https://api.openai.com/v1",
    default_model: "gpt-4o",
    available_models: [
      "gpt-4o",
      "gpt-4o-mini",
      "o1",
      "o1-mini",
      "o3-mini",
    ],
  },
  deepseek: {
    name: "DeepSeek",
    type: "openai_compatible",
    base_url: "https://api.deepseek.com",
    default_model: "deepseek-chat",
    available_models: [
      "deepseek-chat",
      "deepseek-coder",
      "deepseek-reasoner",
    ],
  },
  groq: {
    name: "Groq",
    type: "openai_compatible",
    base_url: "https://api.groq.com/openai/v1",
    default_model: "llama-3.3-70b-versatile",
    available_models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ],
  },
  together: {
    name: "Together AI",
    type: "openai_compatible",
    base_url: "https://api.together.xyz/v1",
    default_model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    available_models: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
      "mistralai/Mixtral-8x22B-Instruct-v0.1",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
    ],
  },
  ollama: {
    name: "Ollama (Local)",
    type: "openai_compatible",
    base_url: "http://localhost:11434/v1",
    default_model: "llama3.2",
    available_models: [
      "llama3.2",
      "llama3.1",
      "mistral",
      "codellama",
      "qwen2.5",
    ],
  },
};

/**
 * 创建新的提供商配置
 */
export function createProviderConfig(
  preset?: keyof typeof PROVIDER_PRESETS
): LLMProviderConfig {
  const now = new Date().toISOString();
  const presetConfig = preset ? PROVIDER_PRESETS[preset] : {};
  
  return {
    id: crypto.randomUUID(),
    name: presetConfig.name || "Custom Provider",
    type: presetConfig.type || "openai_compatible",
    base_url: presetConfig.base_url || "",
    api_key: "",
    default_model: presetConfig.default_model || "",
    available_models: presetConfig.available_models || [],
    enabled: true,
    is_default: false,
    created_at: now,
    updated_at: now,
  };
}

/**
 * 默认LLM设置
 */
export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  providers: [],
  default_provider_id: null,
};
