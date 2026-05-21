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

/**
 * List EVERY installation across all skills. We fetch this once and let the
 * SkillCard / Home view derive per-skill state without N+1 queries.
 *
 * Returns a flat array; callers will typically group by `skillId`.
 */
export function useAllSkillInstallations() {
  return useQuery({
    queryKey: installKeys.all,
    queryFn: async () => {
      // Passing skill_id: null reaches the `else` branch in the Rust command
      // and returns the full set from the DB.
      return await invoke<SkillInstallation[]>("list_skill_installations", {
        skill_id: null,
      });
    },
  });
}

// ========== AI Tool Detection ==========

/**
 * One row from `detect_ai_tools` — corresponds to one well-known AI tool's
 * `~/.X/skills/` directory. `exists` tells you whether the user has used that
 * tool at all; `skillCount` tells you how many skills are sitting in there.
 *
 * Matches Rust `DetectedAiTool` in `src-tauri/src/commands/mod.rs`.
 */
export interface DetectedAiTool {
  kind: InstallTargetKind;
  label: string;
  path: string;
  exists: boolean;
  skillCount: number;
}

/** Probe the local filesystem for installed AI tools (Claude / Cursor / Codex / Gemini / Agents). */
export function useDetectAiTools() {
  return useQuery({
    queryKey: ["detect-ai-tools"],
    queryFn: async () => {
      return await invoke<DetectedAiTool[]>("detect_ai_tools");
    },
    // The user can install / uninstall AI tools between sessions; refresh on
    // window focus so cards stay honest.
    refetchOnWindowFocus: true,
    staleTime: 1000 * 60, // 1 minute
  });
}
