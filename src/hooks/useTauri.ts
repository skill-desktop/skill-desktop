import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Skill, Space } from "@/types";

// ========== Skill Hooks ==========

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: async () => {
      return await invoke<Skill[]>("get_all_skills");
    },
  });
}

export function useSearchSkills(query: string) {
  return useQuery({
    queryKey: ["skills", "search", query],
    queryFn: async () => {
      if (!query) return [];
      return await invoke<Skill[]>("search_skills", { query });
    },
    enabled: query.length > 0,
  });
}

export function useSkillContent(hash: string | null) {
  return useQuery({
    queryKey: ["skill-content", hash],
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
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

// ========== Library Path Hooks ==========

export function useLibraryPath() {
  return useQuery({
    queryKey: ["library-path"],
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
      queryClient.invalidateQueries({ queryKey: ["library-path"] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

// ========== Space Hooks ==========

export function useSpaces() {
  return useQuery({
    queryKey: ["spaces"],
    queryFn: async () => {
      return await invoke<Space[]>("get_all_spaces");
    },
  });
}

export function useSpace(id: string | null) {
  return useQuery({
    queryKey: ["spaces", id],
    queryFn: async () => {
      if (!id) return null;
      return await invoke<Space>("get_space", { id });
    },
    enabled: !!id,
  });
}

export function useCreateSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      activeDir,
      description,
    }: {
      name: string;
      activeDir: string;
      description?: string;
    }) => {
      return await invoke<Space>("create_space", { name, activeDir, description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
}

export function useUpdateSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      activeDir,
      description,
    }: {
      id: string;
      name?: string;
      activeDir?: string;
      description?: string;
    }) => {
      return await invoke<Space>("update_space", { id, name, activeDir, description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
}

export function useDeleteSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await invoke("delete_space", { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
}

interface SyncResult {
  created: number;
  failed: [string, string][];
}

export function useSyncSpace() {
  return useMutation({
    mutationFn: async ({
      libraryPath,
      activePath,
      enabledSkills,
    }: {
      libraryPath: string;
      activePath: string;
      enabledSkills: string[];
    }) => {
      return await invoke<SyncResult>("sync_space", {
        libraryPath,
        activePath,
        enabledSkills,
      });
    },
  });
}

// ========== File Operations ==========

export function useDeleteSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (hash: string) => {
      await invoke("delete_skill", { hash });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

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

// ========== Import Hooks ==========

interface SkillPreview {
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
}

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
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

// ========== Export Hooks ==========

export function useExportClaudeConfig() {
  return useMutation({
    mutationFn: async (spaceId: string) => {
      return await invoke<string>("export_claude_config", { spaceId });
    },
  });
}

export function useExportGenericConfig() {
  return useMutation({
    mutationFn: async (spaceId: string) => {
      return await invoke<string>("export_generic_config", { spaceId });
    },
  });
}

// ========== Visibility Hooks ==========

export function useSetSkillVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spaceId,
      skillHash,
      isVisible,
    }: {
      spaceId: string;
      skillHash: string;
      isVisible: boolean;
    }) => {
      await invoke("set_skill_visibility", { spaceId, skillHash, isVisible });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["visibility", variables.spaceId] });
      queryClient.invalidateQueries({ queryKey: ["visible-skills", variables.spaceId] });
    },
  });
}

export function useVisibleSkills(spaceId: string | null) {
  return useQuery({
    queryKey: ["visible-skills", spaceId],
    queryFn: async () => {
      if (!spaceId) return [];
      return await invoke<Skill[]>("get_visible_skills", { spaceId });
    },
    enabled: !!spaceId,
  });
}

export function useSkillVisibilityMap(spaceId: string | null) {
  return useQuery({
    queryKey: ["visibility", spaceId],
    queryFn: async () => {
      if (!spaceId) return {};
      return await invoke<Record<string, boolean>>("get_skill_visibility_map", { spaceId });
    },
    enabled: !!spaceId,
  });
}

export function useSetBulkSkillVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spaceId,
      skillHashes,
      isVisible,
    }: {
      spaceId: string;
      skillHashes: string[];
      isVisible: boolean;
    }) => {
      await invoke("set_bulk_skill_visibility", { spaceId, skillHashes, isVisible });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["visibility", variables.spaceId] });
      queryClient.invalidateQueries({ queryKey: ["visible-skills", variables.spaceId] });
    },
  });
}

export function useInitSpaceVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (spaceId: string) => {
      await invoke("init_space_visibility", { spaceId });
    },
    onSuccess: (_, spaceId) => {
      queryClient.invalidateQueries({ queryKey: ["visibility", spaceId] });
      queryClient.invalidateQueries({ queryKey: ["visible-skills", spaceId] });
    },
  });
}

// ========== GitHub Import Hooks ==========

interface GitHubFileEntry {
  name: string;
  path: string;
  fileType: string;
  size?: number;
  downloadUrl?: string;
}

export function useBrowseGitHubRepo(
  owner: string,
  repo: string,
  path?: string,
  branch?: string
) {
  return useQuery({
    queryKey: ["github", "browse", owner, repo, path, branch],
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
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
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
      queryClient.invalidateQueries({ queryKey: ["skills"] });
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
        queryClient.invalidateQueries({ queryKey: ["skills"] });
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
    queryKey: ["file-watcher-status"],
    queryFn: async () => {
      return await invoke<boolean>("is_file_watcher_running");
    },
  });
}

// ========== MCP Server Hooks ==========

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function useConnectMcpServer() {
  return useMutation({
    mutationFn: async (url: string) => {
      return await invoke<McpTool[]>("connect_mcp_server", { url });
    },
  });
}

export function useImportMcpToolAsSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      serverUrl,
      toolName,
      toolDescription,
      inputSchema,
    }: {
      serverUrl: string;
      toolName: string;
      toolDescription: string;
      inputSchema: Record<string, unknown>;
    }) => {
      return await invoke<Skill>("import_mcp_tool_as_skill", {
        serverUrl,
        toolName,
        toolDescription,
        inputSchema,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
