import { invoke } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ========== Types ==========

export interface AppSettings {
  language?: string;
  setupCompleted: boolean;
  theme?: string;
  /**
   * AI tool kinds the user wants new skills auto-installed to.
   * Values are `InstallTargetKind` strings (`claude` / `cursor` / `codex` / `gemini`).
   * Empty array means "no preference — ask every time".
   */
  autoInstallTargets?: string[];
}

// ========== Query Keys ==========
export const appSettingsKeys = {
  all: ["app-settings"] as const,
};

// ========== App Settings Hooks ==========

export function useLoadAppSettings() {
  return useQuery({
    queryKey: appSettingsKeys.all,
    queryFn: async () => {
      return await invoke<AppSettings>("load_app_settings");
    },
  });
}

export function useSaveAppSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: AppSettings) => {
      await invoke("save_app_settings", { settings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appSettingsKeys.all });
    },
  });
}

export function useUpdateAppSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      return await invoke<AppSettings>("update_app_setting", { key, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appSettingsKeys.all });
    },
  });
}
