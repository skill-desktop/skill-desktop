import { invoke } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { skillKeys } from "./useSkills";

// ========== Query Keys ==========
export const libraryKeys = {
  path: ["library-path"] as const,
};

// ========== Library Path Hooks ==========

export function useLibraryPath() {
  return useQuery({
    queryKey: libraryKeys.path,
    queryFn: async () => {
      return await invoke<string>("get_library_path");
    },
  });
}

export function useSetLibraryPath() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (path: string) => {
      await invoke("set_library_path", { path });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.path });
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}
