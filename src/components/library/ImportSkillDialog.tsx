import React from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  Github,
  Server,
  Compass,
  HardDrive,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  usePreviewSkillFromUrl,
  useImportSkillFromUrl,
  useBrowseGitHubRepo,
  usePreviewGitHubSkill,
  useImportGitHubSkill,
  useImportGitHubDirectory,
  useConnectMcpServer,
  useImportMcpToolAsSkill,
  usePreviewLocalSkill,
  useImportLocalSkillsBatch,
} from "@/hooks";
import { useSettingsStore, useAppStore } from "@/stores";
import {
  UrlImportPanel,
  GitHubImportPanel,
  McpImportPanel,
  SkillPreviewPanel,
  LocalImportPanel,
  DiscoverPanel,
  type ImportSource,
  type PreviewData,
  type GitHubFileEntry,
  type McpTool,
} from "@/components/hub";

// "discover" and "local" are dialog-only sources we layer on top of the
// shared `ImportSource` enum used by individual panels.
type ExtendedImportSource = ImportSource | "discover" | "local";

interface ImportSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Which source tab to pre-select when the dialog opens. Used by the Home
   * view's "Browse examples" / "Import from folder" cards so they can deep-link
   * straight into the right panel. Defaults to "local".
   */
  defaultSource?: ExtendedImportSource;
}

export function ImportSkillDialog({
  open,
  onOpenChange,
  defaultSource = "local",
}: ImportSkillDialogProps) {
  const { t } = useTranslation();
  const [importSource, setImportSource] =
    React.useState<ExtendedImportSource>(defaultSource);

  // Sync the active tab whenever the dialog (re)opens with a different
  // requested default — otherwise the second time you click "Browse examples"
  // after having clicked "Import from folder" you'd still see the local panel.
  React.useEffect(() => {
    if (open) {
      setImportSource(defaultSource);
    }
  }, [open, defaultSource]);

  // Tell the rest of the app (specifically the global QuickInstallSheet drop
  // listener) that this dialog is in the foreground. While we're open, the
  // LocalImportPanel inside us owns the drag-drop event; the global handler
  // bails so we don't double-import.
  const setImportDialogActive = useAppStore((s) => s.setImportDialogActive);
  React.useEffect(() => {
    setImportDialogActive(open);
    return () => setImportDialogActive(false);
  }, [open, setImportDialogActive]);
  const [url, setUrl] = React.useState("");
  const [preview, setPreview] = React.useState<PreviewData | null>(null);
  const [importSuccess, setImportSuccess] = React.useState(false);

  // GitHub state
  const [githubUrl, setGithubUrl] = React.useState("");
  const [githubOwner, setGithubOwner] = React.useState("");
  const [githubRepo, setGithubRepo] = React.useState("");
  const [githubBranch, setGithubBranch] = React.useState("main");
  const [githubPath, setGithubPath] = React.useState("");
  const [pathHistory, setPathHistory] = React.useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = React.useState<Set<string>>(new Set());
  const [browsingEnabled, setBrowsingEnabled] = React.useState(false);

  // Local import state
  const [localImportResult, setLocalImportResult] = React.useState<{
    imported: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [isImportingLocalPreview, setIsImportingLocalPreview] = React.useState(false);
  const previewLocalMutation = usePreviewLocalSkill();
  const importLocalBatchMutation = useImportLocalSkillsBatch();

  const { libraryPath } = useSettingsStore();
  const previewMutation = usePreviewSkillFromUrl();
  const importMutation = useImportSkillFromUrl();
  
  // GitHub hooks
  const { data: githubFiles = [], isLoading: isLoadingGithub, error: githubError } = useBrowseGitHubRepo(
    githubOwner,
    githubRepo,
    githubPath,
    githubBranch
  );
  const previewGithubMutation = usePreviewGitHubSkill();
  const importGithubMutation = useImportGitHubSkill();
  const importDirectoryMutation = useImportGitHubDirectory();

  // Parse GitHub URL
  const parseGithubUrl = (inputUrl: string) => {
    const patterns = [
      /github\.com\/([^\/]+)\/([^\/]+)(?:\/(?:tree|blob)\/([^\/]+)(?:\/(.*))?)?/,
      /github\.com\/([^\/]+)\/([^\/]+)/,
    ];

    for (const pattern of patterns) {
      const match = inputUrl.match(pattern);
      if (match) {
        setGithubOwner(match[1]);
        setGithubRepo(match[2]);
        setGithubBranch(match[3] || "main");
        setGithubPath(match[4] || "");
        setBrowsingEnabled(true);
        return true;
      }
    }
    return false;
  };

  const handleGithubConnect = () => {
    if (parseGithubUrl(githubUrl)) {
      setPathHistory([]);
    }
  };

  const handleNavigateToPath = (path: string) => {
    setPathHistory([...pathHistory, githubPath]);
    setGithubPath(path);
  };

  const handleNavigateBack = () => {
    if (pathHistory.length > 0) {
      const newHistory = [...pathHistory];
      const previousPath = newHistory.pop() || "";
      setPathHistory(newHistory);
      setGithubPath(previousPath);
    }
  };

  const handleToggleFileSelection = (filePath: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(filePath)) {
      newSelected.delete(filePath);
    } else {
      newSelected.add(filePath);
    }
    setSelectedFiles(newSelected);
  };

  const handlePreviewGithubFile = async (file: GitHubFileEntry) => {
    if (file.fileType !== "file" || !file.name.endsWith(".md")) return;
    
    try {
      const result = await previewGithubMutation.mutateAsync({
        owner: githubOwner,
        repo: githubRepo,
        path: file.path,
        branch: githubBranch,
      });
      setPreview(result);
    } catch (error) {
      console.error("Failed to preview:", error);
    }
  };

  const handleImportSelectedFiles = async () => {
    if (selectedFiles.size === 0) return;

    let successCount = 0;

    for (const filePath of selectedFiles) {
      try {
        await importGithubMutation.mutateAsync({
          owner: githubOwner,
          repo: githubRepo,
          path: filePath,
          branch: githubBranch,
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to import ${filePath}:`, error);
      }
    }

    if (successCount > 0) {
      setImportSuccess(true);
      setSelectedFiles(new Set());
      setTimeout(() => setImportSuccess(false), 2000);
    }
  };

  const handleImportDirectory = async () => {
    try {
      const result = await importDirectoryMutation.mutateAsync({
        owner: githubOwner,
        repo: githubRepo,
        path: githubPath,
        branch: githubBranch,
      });
      if (result.imported > 0) {
        setImportSuccess(true);
        setTimeout(() => setImportSuccess(false), 2000);
      }
    } catch (error) {
      console.error("Failed to import directory:", error);
    }
  };

  // MCP state
  const [mcpUrl, setMcpUrl] = React.useState("");
  const [mcpTools, setMcpTools] = React.useState<McpTool[]>([]);
  const [mcpConnected, setMcpConnected] = React.useState(false);
  const [selectedMcpTools, setSelectedMcpTools] = React.useState<Set<string>>(new Set());

  const connectMcpMutation = useConnectMcpServer();
  const importMcpToolMutation = useImportMcpToolAsSkill();

  const handleConnectMcp = async () => {
    if (!mcpUrl) return;
    setMcpTools([]);
    setMcpConnected(false);

    try {
      const tools = await connectMcpMutation.mutateAsync(mcpUrl);
      setMcpTools(tools);
      setMcpConnected(true);
    } catch (error) {
      console.error("Failed to connect to MCP server:", error);
    }
  };

  const handleToggleMcpToolSelection = (toolName: string) => {
    const newSelected = new Set(selectedMcpTools);
    if (newSelected.has(toolName)) {
      newSelected.delete(toolName);
    } else {
      newSelected.add(toolName);
    }
    setSelectedMcpTools(newSelected);
  };

  const handleImportSelectedMcpTools = async () => {
    if (selectedMcpTools.size === 0) return;

    let successCount = 0;

    for (const toolName of selectedMcpTools) {
      const tool = mcpTools.find((t) => t.name === toolName);
      if (!tool) continue;

      try {
        await importMcpToolMutation.mutateAsync({
          serverUrl: mcpUrl,
          toolName: tool.name,
          toolDescription: tool.description,
          inputSchema: tool.inputSchema,
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to import ${toolName}:`, error);
      }
    }

    if (successCount > 0) {
      setImportSuccess(true);
      setSelectedMcpTools(new Set());
      setTimeout(() => setImportSuccess(false), 2000);
    }
  };

  const handlePreviewMcpTool = (tool: McpTool) => {
    setPreview({
      metadata: {
        name: tool.name,
        version: "1.0.0",
        description: tool.description,
        author: "MCP Server",
        tags: ["mcp", "imported"],
        permissions: ["network"],
        parameters: Object.entries(
          (tool.inputSchema as Record<string, unknown>)?.properties || {}
        ).map(([name, prop]: [string, unknown]) => ({
          name,
          type: (prop as Record<string, unknown>)?.type as string || "string",
          required: ((tool.inputSchema as Record<string, unknown>)?.required as string[] || []).includes(name),
          description: (prop as Record<string, unknown>)?.description as string || "",
        })),
      },
      content: `# ${tool.name}\n\n${tool.description}\n\n## Input Schema\n\n\`\`\`json\n${JSON.stringify(tool.inputSchema, null, 2)}\n\`\`\``,
      sourceUrl: mcpUrl,
    });
  };

  const handlePreview = async () => {
    if (!url) return;
    setPreview(null);
    setImportSuccess(false);

    try {
      const result = await previewMutation.mutateAsync(url);
      setPreview(result);
    } catch (error) {
      console.error("Failed to preview:", error);
    }
  };

  const handleImport = async () => {
    if (!preview) return;

    try {
      await importMutation.mutateAsync(preview.sourceUrl);
      setImportSuccess(true);
      setTimeout(() => {
        setPreview(null);
        setUrl("");
        setImportSuccess(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to import:", error);
    }
  };

  const clearPreview = () => {
    setPreview(null);
    setUrl("");
    previewMutation.reset();
    importMutation.reset();
    setImportSuccess(false);
  };

  // ===== Local import handlers =====

  const handlePreviewLocal = React.useCallback(
    async (path: string) => {
      try {
        const result = await previewLocalMutation.mutateAsync(path);
        // Reuse the standard preview panel (right pane).
        setPreview(result);
      } catch (e) {
        console.error("Failed to preview local skill:", e);
      }
    },
    [previewLocalMutation]
  );

  const handleImportLocalBatch = React.useCallback(
    async (paths: string[]) => {
      setLocalImportResult(null);
      try {
        const result = await importLocalBatchMutation.mutateAsync(paths);
        setLocalImportResult({
          imported: result.imported,
          skipped: result.skipped,
          failed: result.errors.length,
        });
      } catch (e) {
        console.error("Local batch import failed:", e);
        setLocalImportResult({
          imported: 0,
          skipped: 0,
          failed: paths.length,
        });
      }
    },
    [importLocalBatchMutation]
  );

  // Import the currently-previewed local skill (right pane "Import to Library" button).
  // The preview's `sourceUrl` is a `file://` URI we put there in `preview_local_skill`.
  const handleImportLocalPreview = React.useCallback(async () => {
    if (!preview) return;
    const sourceUrl = preview.sourceUrl;
    if (!sourceUrl.startsWith("file://")) return;
    const path = decodeURIComponent(sourceUrl.replace(/^file:\/\//, ""));

    setIsImportingLocalPreview(true);
    try {
      await importLocalBatchMutation.mutateAsync([path]);
      setImportSuccess(true);
      setTimeout(() => {
        setPreview(null);
        setImportSuccess(false);
      }, 1500);
    } catch (e) {
      console.error("Failed to import local preview:", e);
    } finally {
      setIsImportingLocalPreview(false);
    }
  }, [preview, importLocalBatchMutation]);

  // M2-5 (deep): The sidebar funnels into 2 categories, with Discover
  // collapsing what used to be 4 separate tabs (Examples / Registry / URL /
  // GitHub / MCP) — Examples + Registry are merged into the new unified
  // `DiscoverPanel` (one search box across both sources). URL / GitHub /
  // MCP each remain as a dedicated panel because they aren't search-driven —
  // the user explicitly provides a URL, repo, or server endpoint.
  const sourceGroups = [
    {
      label: t("hub.group.local", "Local"),
      sources: [
        { id: "local" as const, icon: HardDrive, label: t("hub.source.local") },
      ],
    },
    {
      label: t("hub.group.discover", "Discover"),
      sources: [
        { id: "discover" as const, icon: Compass, label: t("discover.title") },
        { id: "github" as const, icon: Github, label: t("hub.source.github") },
        { id: "url" as const, icon: Link, label: t("hub.source.url") },
        { id: "mcp" as const, icon: Server, label: t("hub.source.mcp") },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] h-[600px] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border-default bg-bg-secondary/50">
          <DialogTitle>{t("hub.title")}</DialogTitle>
          <DialogDescription>
            {t("hub.warnings.verifySource")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* 1. Source Sidebar — grouped into "Local" and "Discover" so the
              user picks a *category* first instead of guessing between 6
              flat tabs (M2-5). */}
          <div className="w-[200px] border-r border-border-default bg-bg-secondary flex flex-col">
            <div className="p-2 space-y-4">
              {sourceGroups.map((group) => (
                <div key={group.label} className="space-y-1">
                  <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    {group.label}
                  </div>
                  {group.sources.map((source) => {
                    const Icon = source.icon;
                    const isActive = importSource === source.id;
                    return (
                      <Button
                        key={source.id}
                        variant={isActive ? "secondary" : "ghost"}
                        className={`w-full justify-start gap-3 h-10 ${isActive ? "bg-bg-tertiary shadow-sm" : "hover:bg-bg-tertiary/50"}`}
                        onClick={() => setImportSource(source.id)}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-text-muted"}`} />
                        <span className={isActive ? "text-text-primary font-medium" : "text-text-secondary"}>
                          {source.label}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* 2. Configuration Area. The Discover panel is wide because it
              owns the search results grid; everything else gets the standard
              340px column. */}
          <div
            className={
              importSource === "discover"
                ? "flex-1 border-r border-border-default flex flex-col bg-bg-primary"
                : "w-[340px] border-r border-border-default flex flex-col bg-bg-primary"
            }
          >
            <ScrollArea className="flex-1">
              <div className="p-4">
                {importSource === "local" && (
                  <LocalImportPanel
                    libraryPath={libraryPath}
                    onPreviewCandidate={handlePreviewLocal}
                    onImportSelected={handleImportLocalBatch}
                    isImporting={importLocalBatchMutation.isPending}
                    lastImportResult={localImportResult}
                  />
                )}

                {importSource === "discover" && <DiscoverPanel />}

                {importSource === "url" && (
                  <UrlImportPanel
                    url={url}
                    onUrlChange={setUrl}
                    libraryPath={libraryPath}
                    isPending={previewMutation.isPending}
                    isError={previewMutation.isError}
                    error={previewMutation.error}
                    onPreview={handlePreview}
                  />
                )}

                {importSource === "github" && (
                  <GitHubImportPanel
                    githubUrl={githubUrl}
                    onGithubUrlChange={setGithubUrl}
                    libraryPath={libraryPath}
                    onConnect={handleGithubConnect}
                    browsingEnabled={browsingEnabled}
                    githubOwner={githubOwner}
                    githubRepo={githubRepo}
                    githubPath={githubPath}
                    pathHistory={pathHistory}
                    onNavigateBack={handleNavigateBack}
                    onNavigateToPath={handleNavigateToPath}
                    githubFiles={githubFiles}
                    isLoadingGithub={isLoadingGithub}
                    githubError={githubError}
                    selectedFiles={selectedFiles}
                    onToggleFileSelection={handleToggleFileSelection}
                    onPreviewFile={handlePreviewGithubFile}
                    onImportSelected={handleImportSelectedFiles}
                    onImportDirectory={handleImportDirectory}
                    isImportingFiles={importGithubMutation.isPending}
                    isImportingDirectory={importDirectoryMutation.isPending}
                    importDirectoryResult={importDirectoryMutation.isSuccess ? importDirectoryMutation.data : null}
                  />
                )}

                {importSource === "mcp" && (
                  <McpImportPanel
                    mcpUrl={mcpUrl}
                    onMcpUrlChange={setMcpUrl}
                    libraryPath={libraryPath}
                    onConnect={handleConnectMcp}
                    isConnecting={connectMcpMutation.isPending}
                    connectError={connectMcpMutation.error}
                    mcpConnected={mcpConnected}
                    mcpTools={mcpTools}
                    selectedMcpTools={selectedMcpTools}
                    onToggleToolSelection={handleToggleMcpToolSelection}
                    onPreviewTool={handlePreviewMcpTool}
                    onImportSelected={handleImportSelectedMcpTools}
                    isImporting={importMcpToolMutation.isPending}
                  />
                )}
              </div>
            </ScrollArea>
          </div>

          {/* 3. Preview Area — Discover handles its own preview/import inline,
              so we hide the right pane when that source is active. */}
          {importSource !== "discover" && (
            <div className="flex-1 flex flex-col bg-bg-tertiary/30 overflow-hidden">
              <SkillPreviewPanel
                preview={preview}
                onClearPreview={clearPreview}
                importSuccess={importSuccess}
                isImporting={
                  importSource === "local"
                    ? isImportingLocalPreview
                    : importMutation.isPending
                }
                importError={
                  importSource === "local"
                    ? importLocalBatchMutation.error
                    : importMutation.error
                }
                onImport={
                  importSource === "local"
                    ? handleImportLocalPreview
                    : handleImport
                }
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
