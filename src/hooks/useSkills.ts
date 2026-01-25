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
