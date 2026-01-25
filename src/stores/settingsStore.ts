import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LLMProviderConfig, LLMSettings } from "@/types/llm";
import { DEFAULT_LLM_SETTINGS } from "@/types/llm";
import type { CLIToolConfig, CLISettings } from "@/types/cli";
import { DEFAULT_CLI_SETTINGS } from "@/types/cli";

// Define supported language type locally to avoid circular dependency
type SupportedLanguage = "en" | "zh-CN" | "zh-TW" | "ja" | "ko" | "de" | "fr" | "es" | "pt" | "ru";

interface SettingsState {
  // Library 目录
  libraryPath: string;
  setLibraryPath: (path: string) => void;

  // 主题设置
  theme: "dark" | "light" | "system";
  setTheme: (theme: "dark" | "light" | "system") => void;

  // 语言设置
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;

  // 是否完成初始设置（首次启动语言选择）
  setupCompleted: boolean;
  setSetupCompleted: (completed: boolean) => void;

  // 自动监控文件变化
  autoSync: boolean;
  setAutoSync: (enabled: boolean) => void;

  // 高危命令确认
  confirmDangerousCommands: boolean;
  setConfirmDangerousCommands: (enabled: boolean) => void;

  // 视图模式
  viewMode: "grid" | "list";
  setViewMode: (mode: "grid" | "list") => void;

  // LLM 设置
  llmSettings: LLMSettings;
  setLLMSettings: (settings: LLMSettings) => void;
  addLLMProvider: (provider: LLMProviderConfig) => void;
  updateLLMProvider: (id: string, updates: Partial<LLMProviderConfig>) => void;
  removeLLMProvider: (id: string) => void;
  setDefaultLLMProvider: (id: string | null) => void;

  // CLI 工具设置
  cliSettings: CLISettings;
  setCLISettings: (settings: CLISettings) => void;
  addCLITool: (tool: CLIToolConfig) => void;
  updateCLITool: (id: string, updates: Partial<CLIToolConfig>) => void;
  removeCLITool: (id: string) => void;
  setAutoApplyEnv: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      libraryPath: "",
      setLibraryPath: (path) => set({ libraryPath: path }),

      theme: "dark",
      setTheme: (theme) => set({ theme }),

      language: "en",
      setLanguage: (language) => set({ language }),

      setupCompleted: false,
      setSetupCompleted: (completed) => set({ setupCompleted: completed }),

      autoSync: true,
      setAutoSync: (enabled) => set({ autoSync: enabled }),

      confirmDangerousCommands: true,
      setConfirmDangerousCommands: (enabled) =>
        set({ confirmDangerousCommands: enabled }),

      viewMode: "grid",
      setViewMode: (mode) => set({ viewMode: mode }),

      // LLM Settings
      llmSettings: DEFAULT_LLM_SETTINGS,
      setLLMSettings: (settings) => set({ llmSettings: settings }),
      
      addLLMProvider: (provider) => {
        const { llmSettings } = get();
        const newProviders = [...llmSettings.providers, provider];
        // 如果是第一个提供商，设为默认
        const defaultId = llmSettings.default_provider_id || (newProviders.length === 1 ? provider.id : null);
        set({
          llmSettings: {
            ...llmSettings,
            providers: newProviders,
            default_provider_id: defaultId,
          },
        });
      },
      
      updateLLMProvider: (id, updates) => {
        const { llmSettings } = get();
        const now = new Date().toISOString();
        set({
          llmSettings: {
            ...llmSettings,
            providers: llmSettings.providers.map((p) =>
              p.id === id ? { ...p, ...updates, updated_at: now } : p
            ),
          },
        });
      },
      
      removeLLMProvider: (id) => {
        const { llmSettings } = get();
        const newProviders = llmSettings.providers.filter((p) => p.id !== id);
        // 如果删除的是默认提供商，重新选择一个
        let newDefaultId = llmSettings.default_provider_id;
        if (newDefaultId === id) {
          newDefaultId = newProviders.length > 0 ? newProviders[0].id : null;
        }
        set({
          llmSettings: {
            ...llmSettings,
            providers: newProviders,
            default_provider_id: newDefaultId,
          },
        });
      },
      
      setDefaultLLMProvider: (id) => {
        const { llmSettings } = get();
        set({
          llmSettings: {
            ...llmSettings,
            default_provider_id: id,
          },
        });
      },

      // CLI Settings
      cliSettings: DEFAULT_CLI_SETTINGS,
      setCLISettings: (settings) => set({ cliSettings: settings }),

      addCLITool: (tool) => {
        const { cliSettings } = get();
        set({
          cliSettings: {
            ...cliSettings,
            tools: [...cliSettings.tools, tool],
          },
        });
      },

      updateCLITool: (id, updates) => {
        const { cliSettings } = get();
        const now = new Date().toISOString();
        set({
          cliSettings: {
            ...cliSettings,
            tools: cliSettings.tools.map((t) =>
              t.id === id ? { ...t, ...updates, updated_at: now } : t
            ),
          },
        });
      },

      removeCLITool: (id) => {
        const { cliSettings } = get();
        set({
          cliSettings: {
            ...cliSettings,
            tools: cliSettings.tools.filter((t) => t.id !== id),
          },
        });
      },

      setAutoApplyEnv: (enabled) => {
        const { cliSettings } = get();
        set({
          cliSettings: {
            ...cliSettings,
            auto_apply_env: enabled,
          },
        });
      },
    }),
    {
      name: "skill-desktop-settings",
    }
  )
);
