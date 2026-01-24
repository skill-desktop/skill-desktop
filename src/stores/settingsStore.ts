import { create } from "zustand";
import { persist } from "zustand/middleware";

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
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: "skill-desktop-settings",
    }
  )
);
