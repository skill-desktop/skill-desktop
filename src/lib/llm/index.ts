/**
 * LLM Service - 统一的LLM请求层
 * 
 * 支持三种API类型：
 * 1. OpenAI Compatible (Chat Completions API)
 * 2. Anthropic (Messages API)
 * 3. OpenAI Responses API
 */

import type {
  LLMProviderConfig,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  ChatMessage,
} from "@/types/llm";
import { useSettingsStore } from "@/stores";

/**
 * LLM Service Class
 */
export class LLMService {
  private provider: LLMProviderConfig;

  constructor(provider: LLMProviderConfig) {
    this.provider = provider;
  }

  /**
   * 发送聊天请求（非流式）
   */
  async chat(options: Omit<LLMRequestOptions, "provider_id" | "stream">): Promise<LLMResponse> {
    const model = options.model || this.provider.default_model;

    switch (this.provider.type) {
      case "openai_compatible":
        return this.chatOpenAI(model, options);
      case "anthropic":
        return this.chatAnthropic(model, options);
      case "openai_responses":
        return this.chatOpenAIResponses(model, options);
      default:
        throw new Error(`Unsupported provider type: ${this.provider.type}`);
    }
  }

  /**
   * 发送流式聊天请求
   */
  async *chatStream(
    options: Omit<LLMRequestOptions, "provider_id" | "stream">
  ): AsyncGenerator<LLMStreamChunk> {
    const model = options.model || this.provider.default_model;

    switch (this.provider.type) {
      case "openai_compatible":
        yield* this.chatOpenAIStream(model, options);
        break;
      case "anthropic":
        yield* this.chatAnthropicStream(model, options);
        break;
      case "openai_responses":
        yield* this.chatOpenAIResponsesStream(model, options);
        break;
      default:
        throw new Error(`Unsupported provider type: ${this.provider.type}`);
    }
  }

  // ========== OpenAI Compatible API ==========

  private async chatOpenAI(
    model: string,
    options: Omit<LLMRequestOptions, "provider_id" | "stream">
  ): Promise<LLMResponse> {
    const url = `${this.provider.base_url}/chat/completions`;
    
    const body: Record<string, unknown> = {
      model,
      messages: options.messages,
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;
    if (options.top_p !== undefined) body.top_p = options.top_p;
    if (options.stop) body.stop = options.stop;
    if (options.tools) body.tools = options.tools;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.provider.api_key}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    return {
      id: data.id,
      model: data.model,
      content: choice?.message?.content || "",
      finish_reason: choice?.finish_reason || null,
      tool_calls: choice?.message?.tool_calls,
      usage: data.usage,
    };
  }

  private async *chatOpenAIStream(
    model: string,
    options: Omit<LLMRequestOptions, "provider_id" | "stream">
  ): AsyncGenerator<LLMStreamChunk> {
    const url = `${this.provider.base_url}/chat/completions`;
    
    const body: Record<string, unknown> = {
      model,
      messages: options.messages,
      stream: true,
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;
    if (options.top_p !== undefined) body.top_p = options.top_p;
    if (options.stop) body.stop = options.stop;
    if (options.tools) body.tools = options.tools;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.provider.api_key}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const data = JSON.parse(trimmed.slice(6));
          const delta = data.choices?.[0]?.delta?.content || "";
          const finishReason = data.choices?.[0]?.finish_reason;

          yield {
            delta,
            done: !!finishReason,
            finish_reason: finishReason,
          };
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  // ========== Anthropic API ==========

  private async chatAnthropic(
    model: string,
    options: Omit<LLMRequestOptions, "provider_id" | "stream">
  ): Promise<LLMResponse> {
    const url = `${this.provider.base_url}/v1/messages`;
    
    // Anthropic uses separate system parameter
    const systemMessage = options.messages.find((m: ChatMessage) => m.role === "system");
    const messages = options.messages.filter((m: ChatMessage) => m.role !== "system");

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m: ChatMessage) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      max_tokens: options.max_tokens || 4096,
    };

    if (systemMessage) body.system = systemMessage.content;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.top_p !== undefined) body.top_p = options.top_p;
    if (options.stop) body.stop_sequences = options.stop;
    
    // Convert tools to Anthropic format
    if (options.tools) {
      body.tools = options.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.provider.api_key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Extract text content
    const textContent = data.content?.find((c: { type: string }) => c.type === "text");
    const toolUseContent = data.content?.filter((c: { type: string }) => c.type === "tool_use");

    // Convert tool_use to tool_calls format
    const toolCalls = toolUseContent?.length > 0
      ? toolUseContent.map((t: { id: string; name: string; input: unknown }) => ({
          id: t.id,
          type: "function" as const,
          function: {
            name: t.name,
            arguments: JSON.stringify(t.input),
          },
        }))
      : undefined;

    return {
      id: data.id,
      model: data.model,
      content: textContent?.text || "",
      finish_reason: data.stop_reason === "end_turn" ? "stop" : data.stop_reason,
      tool_calls: toolCalls,
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }

  private async *chatAnthropicStream(
    model: string,
    options: Omit<LLMRequestOptions, "provider_id" | "stream">
  ): AsyncGenerator<LLMStreamChunk> {
    const url = `${this.provider.base_url}/v1/messages`;
    
    const systemMessage = options.messages.find((m: ChatMessage) => m.role === "system");
    const messages = options.messages.filter((m: ChatMessage) => m.role !== "system");

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m: ChatMessage) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      max_tokens: options.max_tokens || 4096,
      stream: true,
    };

    if (systemMessage) body.system = systemMessage.content;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.top_p !== undefined) body.top_p = options.top_p;
    if (options.stop) body.stop_sequences = options.stop;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.provider.api_key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        try {
          const data = JSON.parse(trimmed.slice(6));
          
          if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
            yield {
              delta: data.delta.text || "",
              done: false,
            };
          } else if (data.type === "message_stop") {
            yield {
              delta: "",
              done: true,
              finish_reason: "stop",
            };
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  // ========== OpenAI Responses API ==========

  private async chatOpenAIResponses(
    model: string,
    options: Omit<LLMRequestOptions, "provider_id" | "stream">
  ): Promise<LLMResponse> {
    const url = `${this.provider.base_url}/responses`;
    
    // Convert messages to input format for Responses API
    const input = this.convertMessagesToResponsesInput(options.messages);

    const body: Record<string, unknown> = {
      model,
      input,
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.max_tokens !== undefined) body.max_output_tokens = options.max_tokens;

    // Convert tools to Responses API format
    if (options.tools) {
      body.tools = options.tools.map((t) => ({
        type: "function",
        function: t.function,
      }));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.provider.api_key}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Extract output from response
    const outputItem = data.output?.find((o: { type: string }) => o.type === "message");
    const content = outputItem?.content?.find((c: { type: string }) => c.type === "output_text");

    return {
      id: data.id,
      model: data.model,
      content: content?.text || "",
      finish_reason: data.status === "completed" ? "stop" : null,
      usage: data.usage ? {
        prompt_tokens: data.usage.input_tokens || 0,
        completion_tokens: data.usage.output_tokens || 0,
        total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      } : undefined,
    };
  }

  private async *chatOpenAIResponsesStream(
    model: string,
    options: Omit<LLMRequestOptions, "provider_id" | "stream">
  ): AsyncGenerator<LLMStreamChunk> {
    const url = `${this.provider.base_url}/responses`;
    
    const input = this.convertMessagesToResponsesInput(options.messages);

    const body: Record<string, unknown> = {
      model,
      input,
      stream: true,
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.max_tokens !== undefined) body.max_output_tokens = options.max_tokens;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.provider.api_key}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const data = JSON.parse(trimmed.slice(6));
          
          if (data.type === "response.output_text.delta") {
            yield {
              delta: data.delta || "",
              done: false,
            };
          } else if (data.type === "response.completed") {
            yield {
              delta: "",
              done: true,
              finish_reason: "stop",
            };
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  private convertMessagesToResponsesInput(messages: ChatMessage[]): string {
    // For simple cases, just use the last user message
    // For more complex cases, format as a conversation
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    if (lastUserMessage) {
      return lastUserMessage.content;
    }
    return messages.map(m => `${m.role}: ${m.content}`).join("\n");
  }
}

/**
 * 获取默认的LLM服务实例
 */
export function getDefaultLLMService(): LLMService | null {
  const { llmSettings } = useSettingsStore.getState();
  
  if (!llmSettings.default_provider_id) {
    return null;
  }

  const provider = llmSettings.providers.find(
    p => p.id === llmSettings.default_provider_id && p.enabled
  );

  if (!provider) {
    return null;
  }

  return new LLMService(provider);
}

/**
 * 根据提供商ID获取LLM服务实例
 */
export function getLLMService(providerId: string): LLMService | null {
  const { llmSettings } = useSettingsStore.getState();
  
  const provider = llmSettings.providers.find(
    p => p.id === providerId && p.enabled
  );

  if (!provider) {
    return null;
  }

  return new LLMService(provider);
}

/**
 * 获取所有可用的LLM提供商
 */
export function getAvailableLLMProviders(): LLMProviderConfig[] {
  const { llmSettings } = useSettingsStore.getState();
  return llmSettings.providers.filter(p => p.enabled);
}

/**
 * React Hook: 使用LLM服务
 */
export function useLLMService(providerId?: string) {
  const { llmSettings } = useSettingsStore();
  
  const provider = providerId
    ? llmSettings.providers.find(p => p.id === providerId && p.enabled)
    : llmSettings.providers.find(
        p => p.id === llmSettings.default_provider_id && p.enabled
      );

  if (!provider) {
    return null;
  }

  return new LLMService(provider);
}
