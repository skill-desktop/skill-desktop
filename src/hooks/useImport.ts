import { invoke } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Skill, RiskAnalysis } from "@/types";
import { skillKeys } from "./useSkills";

// ========== Types ==========

/**
 * Skill preview data returned from backend
 * Follows Agent Skills specification: https://agentskills.io/specification
 */
export interface SkillPreview {
  metadata: {
    /** Required: Skill name (1-64 chars, lowercase alphanumeric and hyphens) */
    name: string;
    /** Optional: Version string */
    version: string;
    /** Required: Description of what the skill does (1-1024 chars) */
    description: string;
    /** Optional: Author name */
    author?: string;
    /** Optional: License information */
    license?: string;
    /** Optional: Allowed tools */
    allowedTools?: string[];
    /** Optional: Tags for categorization */
    tags: string[];
    /** Optional: Required permissions */
    permissions: string[];
    /** Optional: Input parameters */
    parameters: Array<{
      name: string;
      type: string;
      required: boolean;
      description: string;
    }>;
  };
  content: string;
  sourceUrl: string;
  /** Risk analysis result from code scanning */
  riskAnalysis?: RiskAnalysis;
}

export interface GitHubFileEntry {
  name: string;
  path: string;
  fileType: string;
  size?: number;
  downloadUrl?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ========== Query Keys ==========
export const importKeys = {
  github: {
    browse: (owner: string, repo: string, path?: string, branch?: string) =>
      ["github", "browse", owner, repo, path, branch] as const,
  },
};

// ========== URL Import Hooks ==========

export function usePreviewSkillFromUrl() {
  return useMutation({
    mutationFn: async (url: string) => {
      return await invoke<SkillPreview>("preview_skill_from_url", { url });
    },
  });
}

export function useImportSkillFromUrl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (url: string) => {
      return await invoke<Skill>("import_skill_from_url", { url });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

/**
 * Re-fetch a skill's source URL and overwrite its on-disk SKILL.md.
 * Use for "Update" buttons — `useImportSkillFromUrl` would error because
 * the skill directory already exists.
 *
 * Tauri command takes snake_case argument names; the React Query mutation
 * surface uses camelCase to stay consistent with the rest of the hook
 * layer. Returns the freshly-scanned Skill (with a new hash).
 */
export function useUpdateSkillFromUrl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      currentHash,
      sourceUrl,
    }: {
      currentHash: string;
      sourceUrl: string;
    }) => {
      return await invoke<Skill>("update_skill_from_url", {
        current_hash: currentHash,
        source_url: sourceUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

// ========== GitHub Import Hooks ==========

export function useBrowseGitHubRepo(
  owner: string,
  repo: string,
  path?: string,
  branch?: string
) {
  return useQuery({
    queryKey: importKeys.github.browse(owner, repo, path, branch),
    queryFn: async () => {
      return await invoke<GitHubFileEntry[]>("browse_github_repo", {
        owner,
        repo,
        path,
        branch,
      });
    },
    enabled: !!owner && !!repo,
  });
}

export function usePreviewGitHubSkill() {
  return useMutation({
    mutationFn: async ({
      owner,
      repo,
      path,
      branch,
    }: {
      owner: string;
      repo: string;
      path: string;
      branch?: string;
    }) => {
      return await invoke<SkillPreview>("preview_github_skill", {
        owner,
        repo,
        path,
        branch,
      });
    },
  });
}

export function useImportGitHubSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      owner,
      repo,
      path,
      branch,
    }: {
      owner: string;
      repo: string;
      path: string;
      branch?: string;
    }) => {
      return await invoke<Skill>("import_github_skill", {
        owner,
        repo,
        path,
        branch,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

export function useImportGitHubDirectory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      owner,
      repo,
      path,
      branch,
    }: {
      owner: string;
      repo: string;
      path: string;
      branch?: string;
    }) => {
      return await invoke<ImportResult>("import_github_directory", {
        owner,
        repo,
        path,
        branch,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}
