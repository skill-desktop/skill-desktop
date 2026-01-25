import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  AIToolsConfigSummary,
  ClaudeCodeConfig,
  CursorConfig,
  CursorMdcRule,
  OpenCodeConfig,
  ProjectConfig,
} from "@/types";

// ========== Query Keys ==========
const AI_TOOLS_KEYS = {
  all: ["aiTools"] as const,
  config: () => [...AI_TOOLS_KEYS.all, "config"] as const,
  claudeCode: () => [...AI_TOOLS_KEYS.all, "claudeCode"] as const,
  cursor: () => [...AI_TOOLS_KEYS.all, "cursor"] as const,
  opencode: () => [...AI_TOOLS_KEYS.all, "opencode"] as const,
  cursorMdc: (projectPath: string) => [...AI_TOOLS_KEYS.cursor(), "mdc", projectPath] as const,
  projectConfigs: (projectPath: string) => [...AI_TOOLS_KEYS.all, "project", projectPath] as const,
};

// ========== Queries ==========

/** Get all AI tools configurations */
export function useAIToolsConfig() {
  return useQuery({
    queryKey: AI_TOOLS_KEYS.config(),
    queryFn: async () => {
      return await invoke<AIToolsConfigSummary>("get_ai_tools_config");
    },
  });
}

/** Get Claude Code configuration */
export function useClaudeCodeConfig() {
  return useQuery({
    queryKey: AI_TOOLS_KEYS.claudeCode(),
    queryFn: async () => {
      return await invoke<ClaudeCodeConfig>("get_claude_code_config");
    },
  });
}

/** Get Cursor configuration */
export function useCursorConfig() {
  return useQuery({
    queryKey: AI_TOOLS_KEYS.cursor(),
    queryFn: async () => {
      return await invoke<CursorConfig>("get_cursor_config");
    },
  });
}

/** Get OpenCode configuration */
export function useOpenCodeConfig() {
  return useQuery({
    queryKey: AI_TOOLS_KEYS.opencode(),
    queryFn: async () => {
      return await invoke<OpenCodeConfig>("get_opencode_config");
    },
  });
}

/** Scan Cursor MDC rules in a project */
export function useCursorMdcRules(projectPath: string) {
  return useQuery({
    queryKey: AI_TOOLS_KEYS.cursorMdc(projectPath),
    queryFn: async () => {
      return await invoke<CursorMdcRule[]>("scan_cursor_mdc_rules", { projectPath });
    },
    enabled: !!projectPath,
  });
}

/** Scan project AI configs */
export function useProjectAIConfigs(projectPath: string) {
  return useQuery({
    queryKey: AI_TOOLS_KEYS.projectConfigs(projectPath),
    queryFn: async () => {
      return await invoke<ProjectConfig[]>("scan_project_ai_configs", { projectPath });
    },
    enabled: !!projectPath,
  });
}

// ========== Mutations ==========

/** Save Claude Code global config */
export function useSaveClaudeCodeConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (content: string) => {
      await invoke("save_claude_code_config", { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_TOOLS_KEYS.claudeCode() });
      queryClient.invalidateQueries({ queryKey: AI_TOOLS_KEYS.config() });
    },
  });
}

/** Save Cursor legacy rules */
export function useSaveCursorLegacyRules() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (content: string) => {
      await invoke("save_cursor_legacy_rules", { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_TOOLS_KEYS.cursor() });
      queryClient.invalidateQueries({ queryKey: AI_TOOLS_KEYS.config() });
    },
  });
}

/** Save Cursor MDC rule */
export function useSaveCursorMdcRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ projectPath, ruleName, content }: { projectPath: string; ruleName: string; content: string }) => {
      await invoke("save_cursor_mdc_rule", { projectPath, ruleName, content });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: AI_TOOLS_KEYS.cursorMdc(variables.projectPath) });
    },
  });
}

/** Save OpenCode AGENTS.md */
export function useSaveOpenCodeAgentsMd() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (content: string) => {
      await invoke("save_opencode_agents_md", { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_TOOLS_KEYS.opencode() });
      queryClient.invalidateQueries({ queryKey: AI_TOOLS_KEYS.config() });
    },
  });
}

/** Save OpenCode config JSON */
export function useSaveOpenCodeConfigJson() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (content: string) => {
      await invoke("save_opencode_config_json", { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_TOOLS_KEYS.opencode() });
      queryClient.invalidateQueries({ queryKey: AI_TOOLS_KEYS.config() });
    },
  });
}

/** Save project config */
export function useSaveProjectConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ configPath, content }: { configPath: string; content: string }) => {
      await invoke("save_project_config", { configPath, content });
    },
    onSuccess: () => {
      // Invalidate all project configs as we don't know which project
      queryClient.invalidateQueries({ queryKey: AI_TOOLS_KEYS.all });
    },
  });
}

/** Create project config */
export function useCreateProjectConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ projectPath, configType }: { projectPath: string; configType: string }) => {
      return await invoke<ProjectConfig>("create_project_config", { projectPath, configType });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: AI_TOOLS_KEYS.projectConfigs(variables.projectPath) });
    },
  });
}

/** Delete project config */
export function useDeleteProjectConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (configPath: string) => {
      await invoke("delete_project_config", { configPath });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_TOOLS_KEYS.all });
    },
  });
}
