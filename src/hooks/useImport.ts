import { invoke } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Skill, RiskAnalysis } from "@/types";
import { skillKeys } from "./useSkills";

// ========== Types ==========

export interface SkillPreview {
  metadata: {
    name: string;
    version: string;
    description: string;
    author?: string;
    tags: string[];
    permissions: string[];
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
