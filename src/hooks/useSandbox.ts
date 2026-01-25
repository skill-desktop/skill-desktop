import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery } from "@tanstack/react-query";

/**
 * Execution result from the backend
 */
export interface ExecutionResult {
  /** Whether the execution was successful */
  success: boolean;
  /** Standard output */
  stdout: string;
  /** Standard error output */
  stderr: string;
  /** Exit code (if available) */
  exitCode: number | null;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Execution history entry
 */
export interface ExecutionHistoryEntry {
  id: string;
  skillHash: string;
  skillName: string;
  scriptPath: string;
  args: string[];
  result: ExecutionResult;
  timestamp: Date;
}

// Query keys for sandbox
export const sandboxKeys = {
  all: ["sandbox"] as const,
  scripts: (skillHash: string) => [...sandboxKeys.all, "scripts", skillHash] as const,
};

/**
 * Hook to get available scripts for a skill
 */
export function useSkillScripts(skillHash: string | null) {
  return useQuery({
    queryKey: sandboxKeys.scripts(skillHash || ""),
    queryFn: async () => {
      if (!skillHash) return [];
      return await invoke<string[]>("get_skill_scripts", { skill_hash: skillHash });
    },
    enabled: !!skillHash,
  });
}

/**
 * Hook to execute a skill script
 */
export function useExecuteScript() {
  return useMutation({
    mutationFn: async ({
      skillHash,
      scriptPath,
      args = [],
      envVars = {},
    }: {
      skillHash: string;
      scriptPath: string;
      args?: string[];
      envVars?: Record<string, string>;
    }) => {
      return await invoke<ExecutionResult>("execute_skill_script", {
        skill_hash: skillHash,
        script_path: scriptPath,
        args,
        env_vars: envVars,
      });
    },
  });
}
