import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateSkillRequest, CreateSkillResult } from "@/types";
import { skillKeys } from "./useSkills";

/**
 * Hook for creating new skills
 */
export function useCreateSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateSkillRequest) => {
      return await invoke<CreateSkillResult>("create_skill", { request });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

/**
 * Hook for validating skill name
 */
export function useValidateSkillName() {
  return useMutation({
    mutationFn: async (name: string) => {
      await invoke("validate_skill_name_cmd", { name });
      return true;
    },
  });
}

/**
 * Hook for validating skill description
 */
export function useValidateSkillDescription() {
  return useMutation({
    mutationFn: async (description: string) => {
      await invoke("validate_skill_description_cmd", { description });
      return true;
    },
  });
}

/**
 * Hook for getting skill resource content
 */
export function useGetSkillResourceContent() {
  return useMutation({
    mutationFn: async ({
      skillHash,
      resourcePath,
    }: {
      skillHash: string;
      resourcePath: string;
    }) => {
      return await invoke<string>("get_skill_resource_content", {
        skill_hash: skillHash,
        resource_path: resourcePath,
      });
    },
  });
}

/**
 * Hook for opening skill directory in file manager
 */
export function useOpenSkillDirectory() {
  return useMutation({
    mutationFn: async (skillDir: string) => {
      await invoke("open_skill_directory", { skill_dir: skillDir });
    },
  });
}
