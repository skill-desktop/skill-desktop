import { invoke } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Skill } from "@/types";
import { skillKeys } from "./useSkills";

// ========== Types ==========

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type McpRegistry = "glama" | "mcpso" | "mcpserversorg" | "smithery";

export interface McpRegistryEntry {
  id: string;
  name: string;
  description: string;
  author?: string;
  repository?: string;
  homepage?: string;
  tags: string[];
  registry: string;
}

// ========== Query Keys ==========
export const mcpKeys = {
  registry: {
    search: (query: string, registry?: McpRegistry) =>
      ["mcp-registry", "search", query, registry] as const,
    featured: (registry?: McpRegistry) =>
      ["mcp-registry", "featured", registry] as const,
    details: (serverId: string | null, registry: McpRegistry | null) =>
      ["mcp-registry", "details", serverId, registry] as const,
  },
};

// ========== MCP Server Hooks ==========

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
        server_url: serverUrl,
        tool_name: toolName,
        tool_description: toolDescription,
        input_schema: inputSchema,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

// ========== MCP Registry Hooks ==========

export function useSearchMcpRegistry(query: string, registry?: McpRegistry) {
  return useQuery({
    queryKey: mcpKeys.registry.search(query, registry),
    queryFn: async () => {
      if (!query) return [];
      return await invoke<McpRegistryEntry[]>("search_mcp_registry", {
        query,
        registry,
      });
    },
    enabled: query.length > 0,
  });
}

export function useFeaturedMcpServers(registry?: McpRegistry) {
  return useQuery({
    queryKey: mcpKeys.registry.featured(registry),
    queryFn: async () => {
      return await invoke<McpRegistryEntry[]>("get_featured_mcp_servers", {
        registry,
      });
    },
  });
}

export function useMcpServerDetails(serverId: string | null, registry: McpRegistry | null) {
  return useQuery({
    queryKey: mcpKeys.registry.details(serverId, registry),
    queryFn: async () => {
      if (!serverId || !registry) return null;
      return await invoke<McpRegistryEntry>("get_mcp_server_details", {
        server_id: serverId,
        registry,
      });
    },
    enabled: !!serverId && !!registry,
  });
}

export function useImportMcpRegistryServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: McpRegistryEntry) => {
      return await invoke<Skill>("import_mcp_registry_server", { entry });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}
