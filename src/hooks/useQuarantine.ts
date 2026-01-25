import { invoke } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ========== Query Keys ==========
export const quarantineKeys = {
  all: ["quarantined-skills"] as const,
};

// ========== Quarantine Hooks ==========

export function useQuarantinedSkills() {
  return useQuery({
    queryKey: quarantineKeys.all,
    queryFn: async () => {
      return await invoke<string[]>("get_quarantined_skills");
    },
  });
}

export function useSetSkillQuarantine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ hash, isQuarantined }: { hash: string; isQuarantined: boolean }) => {
      // Note: Tauri expects snake_case parameter names
      await invoke("set_skill_quarantine", { hash, is_quarantined: isQuarantined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quarantineKeys.all });
    },
  });
}
