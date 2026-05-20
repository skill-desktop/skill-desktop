import { invoke } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Skill } from "@/types";

// ========== Query Keys ==========
export const skillKeys = {
  all: ["skills"] as const,
  search: (query: string) => ["skills", "search", query] as const,
  content: (hash: string | null) => ["skill-content", hash] as const,
};

// ========== Skill Hooks ==========

export function useSkills() {
  return useQuery({
    queryKey: skillKeys.all,
    queryFn: async () => {
      return await invoke<Skill[]>("get_all_skills");
    },
  });
}

// ========== Category Hooks ==========

export function useSetSkillCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ hash, category }: { hash: string; category: string }) => {
      await invoke("set_skill_category", { hash, category });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

export function useSearchSkills(query: string) {
  return useQuery({
    queryKey: skillKeys.search(query),
    queryFn: async () => {
      if (!query) return [];
      return await invoke<Skill[]>("search_skills", { query });
    },
    enabled: query.length > 0,
  });
}

export function useSkillContent(hash: string | null) {
  return useQuery({
    queryKey: skillKeys.content(hash),
    queryFn: async () => {
      if (!hash) return null;
      return await invoke<string>("get_skill_content", { hash });
    },
    enabled: !!hash,
  });
}

export function useRescanLibrary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await invoke<number>("rescan_library");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (hash: string) => {
      await invoke("delete_skill", { hash });
    },
    onSuccess: () => {
      // The backend also cleans up installation records and visibility rows are now
      // orphaned (the hash no longer exists). Invalidate every related cache so the
      // UI doesn't keep showing data for a skill that's already gone.
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      queryClient.invalidateQueries({ queryKey: ["visibility"] });
      queryClient.invalidateQueries({ queryKey: ["visible-skills"] });
      queryClient.invalidateQueries({ queryKey: ["install-installations"] });
    },
  });
}

export interface BatchDeleteResult {
  deleted: number;
  failed: [string, string][];
}

export function useDeleteSkillsBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (hashes: string[]) => {
      return await invoke<BatchDeleteResult>("delete_skills_batch", { hashes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      queryClient.invalidateQueries({ queryKey: ["visibility"] });
      queryClient.invalidateQueries({ queryKey: ["visible-skills"] });
      queryClient.invalidateQueries({ queryKey: ["install-installations"] });
    },
  });
}

// ========== Export Hooks ==========

export function useExportSkillsBatch() {
  return useMutation({
    mutationFn: async (skillHashes: string[]) => {
      // Note: Tauri expects snake_case parameter names
      return await invoke<string>("export_skills_batch", { skill_hashes: skillHashes });
    },
  });
}

export function useExportSkillsBatchJson() {
  return useMutation({
    mutationFn: async (skillHashes: string[]) => {
      // Note: Tauri expects snake_case parameter names
      return await invoke<string>("export_skills_batch_json", { skill_hashes: skillHashes });
    },
  });
}

// ========== Version History Hooks ==========

export interface SkillHistoryEntry {
  id: number;
  skillHash: string;
  skillName: string;
  version: string;
  contentHash: string;
  changeType: string;
  changedAt: string;
}

export function useRecordSkillChange() {
  return useMutation({
    mutationFn: async ({
      skillHash,
      skillName,
      version,
      contentHash,
      changeType,
    }: {
      skillHash: string;
      skillName: string;
      version: string;
      contentHash: string;
      changeType: string;
    }) => {
      // Note: Tauri expects snake_case parameter names
      await invoke("record_skill_change", {
        skill_hash: skillHash,
        skill_name: skillName,
        version,
        content_hash: contentHash,
        change_type: changeType,
      });
    },
  });
}

export function useSkillHistory(skillHash: string | null) {
  return useQuery({
    queryKey: ["skill-history", skillHash],
    queryFn: async () => {
      if (!skillHash) return [];
      // Note: Tauri expects snake_case parameter names
      return await invoke<SkillHistoryEntry[]>("get_skill_history", { skill_hash: skillHash });
    },
    enabled: !!skillHash,
  });
}

export function useRecentSkillHistory(limit?: number) {
  return useQuery({
    queryKey: ["skill-history", "recent", limit],
    queryFn: async () => {
      return await invoke<SkillHistoryEntry[]>("get_recent_skill_history", { limit });
    },
  });
}

// ========== Update Detection Hooks ==========

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentHash: string;
  remoteHash: string;
  sourceUrl: string;
}

export interface SkillUpdateInfo {
  skillHash: string;
  skillName: string;
  sourceUrl: string;
  hasUpdate: boolean;
  error?: string;
}

export function useCheckSkillUpdate() {
  return useMutation({
    mutationFn: async ({
      sourceUrl,
      currentHash,
    }: {
      sourceUrl: string;
      currentHash: string;
    }) => {
      // Note: Tauri expects snake_case parameter names
      return await invoke<UpdateCheckResult>("check_skill_update", {
        source_url: sourceUrl,
        current_hash: currentHash,
      });
    },
  });
}

export function useCheckAllSkillUpdates() {
  return useMutation({
    mutationFn: async () => {
      return await invoke<SkillUpdateInfo[]>("check_all_skill_updates");
    },
  });
}
