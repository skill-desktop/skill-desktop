import { invoke } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ========== Types ==========

/** A well-known AI tool that can host installed skills. */
export type InstallTargetKind =
  | "agents"
  | "claude"
  | "cursor"
  | "codex"
  | "gemini"
  | "custom";

export interface InstallTargetInfo {
  kind: InstallTargetKind;
  label: string;
  /** Default skill install directory (undefined for "custom"). */
  defaultPath?: string;
}

export interface InstallSkillResult {
  skillId: string;
  targetKind: InstallTargetKind;
  targetPath: string;
  linkedPath: string;
}

export interface SkillInstallation {
  skillId: string;
  targetKind: InstallTargetKind;
  targetPath: string;
  linkedPath: string;
  installedAt: string;
}

// ========== Query Keys ==========
export const installKeys = {
  targets: ["install-targets"] as const,
  all: ["install-installations"] as const,
  forSkill: (skillId: string | null) =>
    ["install-installations", skillId] as const,
};

// ========== Hooks ==========

/** List all supported install targets (Claude, Cursor, Codex, Gemini, Agents standard, Custom). */
export function useInstallTargets() {
  return useQuery({
    queryKey: installKeys.targets,
    queryFn: async () => {
      return await invoke<InstallTargetInfo[]>("list_install_targets");
    },
    staleTime: 1000 * 60 * 60, // 1h - targets rarely change
  });
}

/** Install a skill (by stable skill_id) to a tool's skills directory via symlink. */
export function useInstallSkillToTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      skillId,
      targetKind,
      customPath,
    }: {
      skillId: string;
      targetKind: InstallTargetKind;
      customPath?: string;
    }) => {
      return await invoke<InstallSkillResult>("install_skill_to_tool", {
        skill_id: skillId,
        target_kind: targetKind,
        custom_path: customPath,
      });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: installKeys.all });
      qc.invalidateQueries({
        queryKey: installKeys.forSkill(variables.skillId),
      });
    },
  });
}

/** Remove a previously installed symlink. */
export function useUninstallSkillFromTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      skillId,
      linkedPath,
      targetPath,
    }: {
      skillId: string;
      linkedPath: string;
      targetPath: string;
    }) => {
      await invoke("uninstall_skill_from_tool", {
        skill_id: skillId,
        linked_path: linkedPath,
        target_path: targetPath,
      });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: installKeys.all });
      qc.invalidateQueries({
        queryKey: installKeys.forSkill(variables.skillId),
      });
    },
  });
}

/** List installations for a single skill (by stable skill_id). */
export function useSkillInstallations(skillId: string | null) {
  return useQuery({
    queryKey: installKeys.forSkill(skillId),
    queryFn: async () => {
      if (!skillId) return [];
      return await invoke<SkillInstallation[]>("list_skill_installations", {
        skill_id: skillId,
      });
    },
    enabled: !!skillId,
  });
}
