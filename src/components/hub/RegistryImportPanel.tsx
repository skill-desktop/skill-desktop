import React from "react";
import { useTranslation } from "react-i18next";
import { Search, Download, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, ScrollArea, Badge } from "@/components/ui";
import type { McpRegistryEntry, McpRegistry } from "@/hooks";

interface RegistryImportPanelProps {
  libraryPath: string;
  // Registry filter
  selectedRegistry: McpRegistry | undefined;
  onRegistryChange: (registry: McpRegistry | undefined) => void;
  // Search
  registrySearch: string;
  onSearchChange: (search: string) => void;
  // Servers
  registryServers: McpRegistryEntry[];
  isLoadingFeatured: boolean;
  isSearching: boolean;
  // Selection
  selectedRegistryEntries: Set<string>;
  onToggleSelection: (id: string) => void;
  onPreviewEntry: (entry: McpRegistryEntry) => void;
  // Import
  onImportSelected: () => void;
  isImporting: boolean;
  importError: unknown;
}

export const RegistryImportPanel: React.FC<RegistryImportPanelProps> = ({
  libraryPath,
  selectedRegistry,
  onRegistryChange,
  registrySearch,
  onSearchChange,
  registryServers,
  isLoadingFeatured,
  isSearching,
  selectedRegistryEntries,
  onToggleSelection,
  onPreviewEntry,
  onImportSelected,
  isImporting,
  importError,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      {/* Registry filter */}
      <div>
        <label className="text-xs text-text-muted mb-1.5 block">
          {t("hub.registry.source")}
        </label>
        <select
          className="w-full h-9 rounded-md border border-border-default bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue"
          value={selectedRegistry || ""}
          onChange={(e) => onRegistryChange(e.target.value as McpRegistry || undefined)}
        >
          <option value="">{t("hub.registry.allRegistries")}</option>
          <option value="glama">Glama.ai</option>
          <option value="mcpso">MCP.so</option>
          <option value="mcpserversorg">MCPServers.org</option>
          <option value="smithery">Smithery.ai</option>
        </select>
      </div>

      {/* Search input */}
      <div>
        <label className="text-xs text-text-muted mb-1.5 block">
          {t("hub.registry.searchServers")}
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            placeholder={t("hub.registry.searchPlaceholder")}
            value={registrySearch}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {!libraryPath && (
        <div className="flex items-start gap-2 text-xs text-accent-yellow">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{t("hub.warnings.setLibraryPath")}</span>
        </div>
      )}

      {/* Servers list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-muted">
            {registrySearch ? t("hub.registry.searchResults") : t("hub.registry.featuredServers")}
          </span>
          <span className="text-xs text-text-muted">
            {t("hub.registry.serversCount", { count: registryServers.length })}
          </span>
        </div>

        {isLoadingFeatured || isSearching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
          </div>
        ) : registryServers.length > 0 ? (
          <>
            <ScrollArea className="h-56 rounded-md border border-border-default">
              <div className="divide-y divide-border-muted">
                {registryServers.map((entry) => (
                  <div
                    key={`${entry.registry}-${entry.id}`}
                    className={cn(
                      "flex items-start gap-2 px-3 py-2 text-xs hover:bg-bg-tertiary cursor-pointer",
                      selectedRegistryEntries.has(entry.id) && "bg-accent-blue/10"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRegistryEntries.has(entry.id)}
                      onChange={() => onToggleSelection(entry.id)}
                      className="h-3.5 w-3.5 mt-0.5"
                    />
                    <button
                      className="flex-1 text-left"
                      onClick={() => onPreviewEntry(entry)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-text-primary font-medium">
                          {entry.name}
                        </span>
                        <Badge variant="default" className="text-[9px] px-1 py-0">
                          {entry.registry}
                        </Badge>
                      </div>
                      <div className="text-text-muted line-clamp-2 mt-0.5">
                        {entry.description}
                      </div>
                      {entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entry.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="blue" className="text-[9px] px-1 py-0">
                              {tag}
                            </Badge>
                          ))}
                          {entry.tags.length > 3 && (
                            <span className="text-[9px] text-text-muted">
                              +{entry.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Button
              variant="secondary"
              size="sm"
              className="w-full mt-3"
              onClick={onImportSelected}
              disabled={selectedRegistryEntries.size === 0 || isImporting || !libraryPath}
            >
              {isImporting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t("hub.github.importSelected")} ({selectedRegistryEntries.size})
            </Button>
          </>
        ) : (
          <div className="text-xs text-text-muted text-center py-8">
            {registrySearch ? t("hub.registry.noServersFound") : t("common.loading")}
          </div>
        )}

        {importError ? (
          <div className="text-xs text-accent-red mt-2">
            {importError instanceof Error ? importError.message : String(importError)}
          </div>
        ) : null}
      </div>
    </div>
  );
};
