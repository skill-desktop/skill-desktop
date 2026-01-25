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
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
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
    },
  });
}

// ========== Export Hooks ==========

export function useExportSkillsBatch() {
  return useMutation({
    mutationFn: async (skillHashes: string[]) => {
      return await invoke<string>("export_skills_batch", { skillHashes });
    },
  });
}

export function useExportSkillsBatchJson() {
  return useMutation({
    mutationFn: async (skillHashes: string[]) => {
      return await invoke<string>("export_skills_batch_json", { skillHashes });
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
      await invoke("record_skill_change", {
        skillHash,
        skillName,
        version,
        contentHash,
        changeType,
      });
    },
  });
}

export function useSkillHistory(skillHash: string | null) {
  return useQuery({
    queryKey: ["skill-history", skillHash],
    queryFn: async () => {
      if (!skillHash) return [];
      return await invoke<SkillHistoryEntry[]>("get_skill_history", { skillHash });
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
      return await invoke<UpdateCheckResult>("check_skill_update", {
        sourceUrl,
        currentHash,
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
