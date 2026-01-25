import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { skillKeys } from "./useSkills";

// ========== Query Keys ==========
export const fileWatcherKeys = {
  status: ["file-watcher-status"] as const,
};

// ========== File Operations ==========

export function useShowInFolder() {
  return useMutation({
    mutationFn: async (path: string) => {
      await invoke("show_in_folder", { path });
    },
  });
}

export function useOpenFile() {
  return useMutation({
    mutationFn: async (path: string) => {
      await invoke("open_file", { path });
    },
  });
}

// ========== File Watcher Hooks ==========

interface FileChangeEvent {
  eventType: string;
  path: string;
}

export function useFileWatcher() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      unlisten = await listen<FileChangeEvent>("file-change", (event) => {
        console.log("File change detected:", event.payload);
        // Invalidate skills query to trigger refetch
        queryClient.invalidateQueries({ queryKey: skillKeys.all });
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [queryClient]);
}

export function useStartFileWatcher() {
  return useMutation({
    mutationFn: async () => {
      return await invoke<boolean>("start_file_watcher");
    },
  });
}

export function useStopFileWatcher() {
  return useMutation({
    mutationFn: async () => {
      return await invoke<boolean>("stop_file_watcher");
    },
  });
}

export function useIsFileWatcherRunning() {
  return useQuery({
    queryKey: fileWatcherKeys.status,
    queryFn: async () => {
      return await invoke<boolean>("is_file_watcher_running");
    },
  });
}
