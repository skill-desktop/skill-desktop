import React from "react";
import { useTranslation } from "react-i18next";
import { Server, Download, AlertTriangle, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, ScrollArea } from "@/components/ui";
import type { McpTool } from "./types";

interface McpImportPanelProps {
  mcpUrl: string;
  onMcpUrlChange: (url: string) => void;
  libraryPath: string;
  onConnect: () => void;
  isConnecting: boolean;
  connectError: unknown;
  // Tools
  mcpConnected: boolean;
  mcpTools: McpTool[];
  selectedMcpTools: Set<string>;
  onToggleToolSelection: (name: string) => void;
  onPreviewTool: (tool: McpTool) => void;
  // Import
  onImportSelected: () => void;
  isImporting: boolean;
}

export const McpImportPanel: React.FC<McpImportPanelProps> = ({
  mcpUrl,
  onMcpUrlChange,
  libraryPath,
  onConnect,
  isConnecting,
  connectError,
  mcpConnected,
  mcpTools,
  selectedMcpTools,
  onToggleToolSelection,
  onPreviewTool,
  onImportSelected,
  isImporting,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-text-muted mb-1.5 block">
          {t("hub.mcp.serverUrl")}
        </label>
        <Input
          placeholder={t("hub.mcp.serverUrlPlaceholder")}
          value={mcpUrl}
          onChange={(e) => onMcpUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onConnect()}
        />
      </div>

      {!libraryPath && (
        <div className="flex items-start gap-2 text-xs text-accent-yellow">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{t("hub.warnings.setLibraryPath")}</span>
        </div>
      )}

      <Button
        className="w-full"
        disabled={!mcpUrl || !libraryPath || isConnecting}
        onClick={onConnect}
      >
        {isConnecting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Server className="h-4 w-4 mr-2" />
        )}
        {t("hub.mcp.connectToServer")}
      </Button>

      {connectError ? (
        <div className="text-xs text-accent-red">
          {connectError instanceof Error ? connectError.message : String(connectError)}
        </div>
      ) : null}

      {/* Tools list */}
      {mcpConnected && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-muted">
              {t("hub.mcp.toolsAvailable", { count: mcpTools.length })}
            </span>
            {mcpTools.length > 0 && (
              <Check className="h-4 w-4 text-accent-green" />
            )}
          </div>

          {mcpTools.length > 0 ? (
            <>
              <ScrollArea className="h-48 rounded-md border border-border-default">
                <div className="divide-y divide-border-muted">
                  {mcpTools.map((tool) => (
                    <div
                      key={tool.name}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-tertiary cursor-pointer",
                        selectedMcpTools.has(tool.name) && "bg-accent-blue/10"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMcpTools.has(tool.name)}
                        onChange={() => onToggleToolSelection(tool.name)}
                        className="h-3.5 w-3.5"
                      />
                      <button
                        className="flex-1 text-left"
                        onClick={() => onPreviewTool(tool)}
                      >
                        <div className="text-text-primary font-medium">
                          {tool.name}
                        </div>
                        <div className="text-text-muted truncate">
                          {tool.description}
                        </div>
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
                disabled={selectedMcpTools.size === 0 || isImporting}
              >
                {isImporting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t("hub.github.importSelected")} ({selectedMcpTools.size})
              </Button>
            </>
          ) : (
            <div className="text-xs text-text-muted text-center py-4">
              {t("hub.mcp.noToolsFound")}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
