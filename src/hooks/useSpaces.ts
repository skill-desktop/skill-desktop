import { invoke } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Space, Skill } from "@/types";

// ========== Query Keys ==========
export const spaceKeys = {
  all: ["spaces"] as const,
  detail: (id: string | null) => ["spaces", id] as const,
  visibility: (spaceId: string | null) => ["visibility", spaceId] as const,
  visibleSkills: (spaceId: string | null) => ["visible-skills", spaceId] as const,
};

// ========== Space Hooks ==========

export function useSpaces() {
  return useQuery({
    queryKey: spaceKeys.all,
    queryFn: async () => {
      return await invoke<Space[]>("get_all_spaces");
    },
  });
}

export function useSpace(id: string | null) {
  return useQuery({
    queryKey: spaceKeys.detail(id),
    queryFn: async () => {
      if (!id) return null;
      return await invoke<Space>("get_space", { id });
    },
    enabled: !!id,
  });
}

export function useCreateSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      activeDir,
      description,
    }: {
      name: string;
      activeDir: string;
      description?: string;
    }) => {
      // Note: Tauri expects snake_case parameter names
      return await invoke<Space>("create_space", { 
        name, 
        active_dir: activeDir, 
        description 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: spaceKeys.all });
    },
  });
}

export function useUpdateSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      activeDir,
      description,
    }: {
      id: string;
      name?: string;
      activeDir?: string;
      description?: string;
    }) => {
      // Note: Tauri expects snake_case parameter names
      return await invoke<Space>("update_space", { 
        id, 
        name, 
        active_dir: activeDir, 
        description 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: spaceKeys.all });
    },
  });
}

export function useDeleteSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await invoke("delete_space", { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: spaceKeys.all });
    },
  });
}

export interface SyncResult {
  created: number;
  failed: [string, string][];
}

export function useSyncSpace() {
  return useMutation({
    mutationFn: async ({
      libraryPath,
      activePath,
      enabledSkills,
    }: {
      libraryPath: string;
      activePath: string;
      enabledSkills: string[];
    }) => {
      return await invoke<SyncResult>("sync_space", {
        library_path: libraryPath,
        active_path: activePath,
        enabled_skills: enabledSkills,
      });
    },
  });
}

// ========== Visibility Hooks ==========

export function useSetSkillVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spaceId,
      skillHash,
      isVisible,
    }: {
      spaceId: string;
      skillHash: string;
      isVisible: boolean;
    }) => {
      // Note: Tauri expects snake_case parameter names
      await invoke("set_skill_visibility", { 
        space_id: spaceId, 
        skill_hash: skillHash, 
        is_visible: isVisible 
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: spaceKeys.visibility(variables.spaceId) });
      queryClient.invalidateQueries({ queryKey: spaceKeys.visibleSkills(variables.spaceId) });
    },
  });
}

export function useVisibleSkills(spaceId: string | null) {
  return useQuery({
    queryKey: spaceKeys.visibleSkills(spaceId),
    queryFn: async () => {
      if (!spaceId) return [];
      // Note: Tauri expects snake_case parameter names
      return await invoke<Skill[]>("get_visible_skills", { space_id: spaceId });
    },
    enabled: !!spaceId,
  });
}

export function useSkillVisibilityMap(spaceId: string | null) {
  return useQuery({
    queryKey: spaceKeys.visibility(spaceId),
    queryFn: async () => {
      if (!spaceId) return {};
      // Note: Tauri expects snake_case parameter names
      return await invoke<Record<string, boolean>>("get_skill_visibility_map", { space_id: spaceId });
    },
    enabled: !!spaceId,
  });
}

export function useSetBulkSkillVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spaceId,
      skillHashes,
      isVisible,
    }: {
      spaceId: string;
      skillHashes: string[];
      isVisible: boolean;
    }) => {
      // Note: Tauri expects snake_case parameter names
      await invoke("set_bulk_skill_visibility", { 
        space_id: spaceId, 
        skill_hashes: skillHashes, 
        is_visible: isVisible 
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: spaceKeys.visibility(variables.spaceId) });
      queryClient.invalidateQueries({ queryKey: spaceKeys.visibleSkills(variables.spaceId) });
    },
  });
}

export function useInitSpaceVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (spaceId: string) => {
      // Note: Tauri expects snake_case parameter names
      await invoke("init_space_visibility", { space_id: spaceId });
    },
    onSuccess: (_, spaceId) => {
      queryClient.invalidateQueries({ queryKey: spaceKeys.visibility(spaceId) });
      queryClient.invalidateQueries({ queryKey: spaceKeys.visibleSkills(spaceId) });
    },
  });
}

// ========== Export Hooks ==========

export function useExportClaudeConfig() {
  return useMutation({
    mutationFn: async (spaceId: string) => {
      // Note: Tauri expects snake_case parameter names
      return await invoke<string>("export_claude_config", { space_id: spaceId });
    },
  });
}

export function useExportGenericConfig() {
  return useMutation({
    mutationFn: async (spaceId: string) => {
      // Note: Tauri expects snake_case parameter names
      return await invoke<string>("export_generic_config", { space_id: spaceId });
    },
  });
}

export function useExportMcpConfig() {
  return useMutation({
    mutationFn: async (spaceId: string) => {
      // Note: Tauri expects snake_case parameter names
      return await invoke<string>("export_mcp_config", { space_id: spaceId });
    },
  });
}
