/**
 * LLM Hooks - React hooks for LLM interactions
 */

import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "@/stores";
import { LLMService } from "@/lib/llm";
import type {
  LLMProviderConfig,
  LLMProviderType,
  LLMResponse,
  ChatMessage,
} from "@/types/llm";

// Backend types
interface LLMTestRequest {
  provider_type: LLMProviderType;
  base_url: string;
  api_key: string;
  model: string;
}

interface LLMTestResult {
  success: boolean;
  message: string;
}

/**
 * Hook返回类型
 */
interface UseLLMReturn {
  /** 当前使用的提供商 */
  provider: LLMProviderConfig | null;
  /** 所有可用的提供商 */
  availableProviders: LLMProviderConfig[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 发送聊天请求 */
  chat: (options: ChatOptions) => Promise<LLMResponse | null>;
  /** 发送流式聊天请求 */
  chatStream: (options: ChatOptions, onChunk: (chunk: string) => void) => Promise<void>;
  /** 取消当前请求 */
  cancel: () => void;
  /** 清除错误 */
  clearError: () => void;
}

interface ChatOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
}

/**
 * 使用LLM服务的Hook
 * @param providerId 可选的提供商ID，不指定则使用默认提供商
 */
export function useLLM(providerId?: string): UseLLMReturn {
  const { llmSettings } = useSettingsStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 获取当前提供商
  const provider = providerId
    ? llmSettings.providers.find(p => p.id === providerId && p.enabled) || null
    : llmSettings.providers.find(
        p => p.id === llmSettings.default_provider_id && p.enabled
      ) || null;

  // 获取所有可用提供商
  const availableProviders = llmSettings.providers.filter(p => p.enabled);

  // 发送聊天请求
  const chat = useCallback(
    async (options: ChatOptions): Promise<LLMResponse | null> => {
      if (!provider) {
        setError("No LLM provider configured");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const service = new LLMService(provider);
        const response = await service.chat({
          messages: options.messages,
          model: options.model,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          top_p: options.topP,
          stop: options.stop,
        });
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [provider]
  );

  // 发送流式聊天请求
  const chatStream = useCallback(
    async (options: ChatOptions, onChunk: (chunk: string) => void): Promise<void> => {
      if (!provider) {
        setError("No LLM provider configured");
        return;
      }

      setIsLoading(true);
      setError(null);
      abortControllerRef.current = new AbortController();

      try {
        const service = new LLMService(provider);
        const stream = service.chatStream({
          messages: options.messages,
          model: options.model,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          top_p: options.topP,
          stop: options.stop,
        });

        for await (const chunk of stream) {
          if (abortControllerRef.current?.signal.aborted) {
            break;
          }
          if (chunk.delta) {
            onChunk(chunk.delta);
          }
          if (chunk.done) {
            break;
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // 请求被取消，不设置错误
          return;
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [provider]
  );

  // 取消当前请求
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  // 清除错误
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    provider,
    availableProviders,
    isLoading,
    error,
    chat,
    chatStream,
    cancel,
    clearError,
  };
}

/**
 * 简单的聊天完成Hook
 * 用于一次性的聊天请求
 */
export function useChatCompletion() {
  const { chat, isLoading, error, clearError, provider } = useLLM();
  const [response, setResponse] = useState<LLMResponse | null>(null);

  const sendMessage = useCallback(
    async (
      content: string,
      options?: {
        systemPrompt?: string;
        model?: string;
        temperature?: number;
        maxTokens?: number;
      }
    ) => {
      const messages: ChatMessage[] = [];
      
      if (options?.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
      }
      
      messages.push({ role: "user", content });

      const result = await chat({
        messages,
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });

      if (result) {
        setResponse(result);
      }

      return result;
    },
    [chat]
  );

  const reset = useCallback(() => {
    setResponse(null);
    clearError();
  }, [clearError]);

  return {
    sendMessage,
    response,
    isLoading,
    error,
    reset,
    hasProvider: !!provider,
  };
}

/**
 * 流式聊天Hook
 * 用于流式响应的聊天
 */
export function useStreamingChat() {
  const { chatStream, isLoading, error, cancel, clearError, provider } = useLLM();
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(
    async (
      userContent: string,
      options?: {
        systemPrompt?: string;
        model?: string;
        temperature?: number;
        maxTokens?: number;
      }
    ) => {
      const messages: ChatMessage[] = [];
      
      if (options?.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
      }
      
      messages.push({ role: "user", content: userContent });

      setContent("");
      setIsStreaming(true);

      await chatStream(
        {
          messages,
          model: options?.model,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        },
        (chunk) => {
          setContent(prev => prev + chunk);
        }
      );

      setIsStreaming(false);
    },
    [chatStream]
  );

  const stop = useCallback(() => {
    cancel();
    setIsStreaming(false);
  }, [cancel]);

  const reset = useCallback(() => {
    setContent("");
    setIsStreaming(false);
    clearError();
  }, [clearError]);

  return {
    sendMessage,
    content,
    isLoading,
    isStreaming,
    error,
    stop,
    reset,
    hasProvider: !!provider,
  };
}

/**
 * 多轮对话Hook
 */
export function useConversation() {
  const { chat, chatStream, isLoading, error, cancel, clearError, provider } = useLLM();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const sendMessage = useCallback(
    async (
      content: string,
      options?: {
        stream?: boolean;
        model?: string;
        temperature?: number;
        maxTokens?: number;
      }
    ) => {
      const userMessage: ChatMessage = { role: "user", content };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);

      if (options?.stream) {
        setIsStreaming(true);
        setStreamingContent("");

        let fullContent = "";
        await chatStream(
          {
            messages: newMessages,
            model: options?.model,
            temperature: options?.temperature,
            maxTokens: options?.maxTokens,
          },
          (chunk) => {
            fullContent += chunk;
            setStreamingContent(fullContent);
          }
        );

        setIsStreaming(false);
        setStreamingContent("");
        
        if (fullContent) {
          setMessages(prev => [
            ...prev,
            { role: "assistant", content: fullContent },
          ]);
        }
      } else {
        const response = await chat({
          messages: newMessages,
          model: options?.model,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        });

        if (response?.content) {
          setMessages(prev => [
            ...prev,
            { role: "assistant", content: response.content },
          ]);
        }
      }
    },
    [messages, chat, chatStream]
  );

  const setSystemPrompt = useCallback((prompt: string) => {
    setMessages([{ role: "system", content: prompt }]);
  }, []);

  const stop = useCallback(() => {
    cancel();
    setIsStreaming(false);
    if (streamingContent) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: streamingContent },
      ]);
      setStreamingContent("");
    }
  }, [cancel, streamingContent]);

  const reset = useCallback(() => {
    setMessages([]);
    setStreamingContent("");
    setIsStreaming(false);
    clearError();
  }, [clearError]);

  return {
    messages,
    sendMessage,
    setSystemPrompt,
    isLoading,
    isStreaming,
    streamingContent,
    error,
    stop,
    reset,
    hasProvider: !!provider,
  };
}

/**
 * 测试LLM连接的Hook
 */
export function useTestLLMConnection() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<LLMTestResult | null>(null);

  const testConnection = useCallback(
    async (provider: LLMProviderConfig): Promise<LLMTestResult> => {
      setIsLoading(true);
      setResult(null);

      try {
        const request: LLMTestRequest = {
          provider_type: provider.type,
          base_url: provider.base_url,
          api_key: provider.api_key,
          model: provider.default_model,
        };

        const testResult = await invoke<LLMTestResult>("test_llm_connection", { request });
        setResult(testResult);
        return testResult;
      } catch (error) {
        const errorResult: LLMTestResult = {
          success: false,
          message: error instanceof Error ? error.message : "Connection failed",
        };
        setResult(errorResult);
        return errorResult;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setResult(null);
  }, []);

  return {
    testConnection,
    isLoading,
    result,
    reset,
  };
}
