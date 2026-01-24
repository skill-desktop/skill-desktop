import React from "react";
import { Link, Github, Server, Download, AlertTriangle, Loader2, Check, X, Folder, FileText, ChevronRight, ArrowLeft, Globe, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, ScrollArea, Badge, Markdown } from "@/components/ui";
import {
  usePreviewSkillFromUrl,
  useImportSkillFromUrl,
  useBrowseGitHubRepo,
  usePreviewGitHubSkill,
  useImportGitHubSkill,
  useImportGitHubDirectory,
  useConnectMcpServer,
  useImportMcpToolAsSkill,
  useFeaturedMcpServers,
  useSearchMcpRegistry,
  useImportMcpRegistryServer,
  type McpRegistryEntry,
  type McpRegistry,
} from "@/hooks";
import { useSettingsStore } from "@/stores";
import { getPermissionLevel } from "@/types";

type ImportSource = "url" | "github" | "mcp" | "registry";

interface PreviewData {
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

interface GitHubFileEntry {
  name: string;
  path: string;
  fileType: string;
  size?: number;
  downloadUrl?: string;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const HubView: React.FC = () => {
  const [importSource, setImportSource] = React.useState<ImportSource>("url");
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
    // Supports formats:
    // https://github.com/owner/repo
    // https://github.com/owner/repo/tree/branch/path
    // https://github.com/owner/repo/blob/branch/path
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
    let errorCount = 0;

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
        errorCount++;
      }
    }

    if (successCount > 0) {
      setImportSuccess(true);
      setSelectedFiles(new Set());
      setTimeout(() => {
        setImportSuccess(false);
      }, 2000);
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
        setTimeout(() => {
          setImportSuccess(false);
        }, 2000);
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

  // Registry state
  const [registrySearch, setRegistrySearch] = React.useState("");
  const [selectedRegistry, setSelectedRegistry] = React.useState<McpRegistry | undefined>(undefined);
  const [selectedRegistryEntries, setSelectedRegistryEntries] = React.useState<Set<string>>(new Set());
  const [registryPreview, setRegistryPreview] = React.useState<McpRegistryEntry | null>(null);

  const { data: featuredServers = [], isLoading: isLoadingFeatured } = useFeaturedMcpServers(selectedRegistry);
  const { data: searchResults = [], isLoading: isSearching } = useSearchMcpRegistry(registrySearch, selectedRegistry);
  const importRegistryMutation = useImportMcpRegistryServer();

  const registryServers = registrySearch ? searchResults : featuredServers;

  const handleToggleRegistrySelection = (entryId: string) => {
    const newSelected = new Set(selectedRegistryEntries);
    if (newSelected.has(entryId)) {
      newSelected.delete(entryId);
    } else {
      newSelected.add(entryId);
    }
    setSelectedRegistryEntries(newSelected);
  };

  const handlePreviewRegistryEntry = (entry: McpRegistryEntry) => {
    setRegistryPreview(entry);
    // Also set the main preview
    setPreview({
      metadata: {
        name: entry.name,
        version: "1.0.0",
        description: entry.description,
        author: entry.author,
        tags: entry.tags.length > 0 ? entry.tags : ["mcp", "registry"],
        permissions: ["network"],
        parameters: [],
      },
      content: `# ${entry.name}\n\n${entry.description}\n\n## Source\n\n- **Registry**: ${entry.registry}\n${entry.repository ? `- **Repository**: ${entry.repository}` : ""}\n${entry.homepage ? `- **Homepage**: ${entry.homepage}` : ""}`,
      sourceUrl: entry.repository || entry.homepage || "",
    });
  };

  const handleImportSelectedRegistryEntries = async () => {
    if (selectedRegistryEntries.size === 0) return;

    let successCount = 0;
    let errorCount = 0;

    for (const entryId of selectedRegistryEntries) {
      const entry = registryServers.find((e) => e.id === entryId);
      if (!entry) continue;

      try {
        await importRegistryMutation.mutateAsync(entry);
        successCount++;
      } catch (error) {
        console.error(`Failed to import ${entry.name}:`, error);
        errorCount++;
      }
    }

    if (successCount > 0) {
      setImportSuccess(true);
      setSelectedRegistryEntries(new Set());
      setTimeout(() => {
        setImportSuccess(false);
      }, 2000);
    }
  };

  const handleImportRegistryEntry = async () => {
    if (!registryPreview) return;

    try {
      await importRegistryMutation.mutateAsync(registryPreview);
      setImportSuccess(true);
      setTimeout(() => {
        setPreview(null);
        setRegistryPreview(null);
        setImportSuccess(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to import:", error);
    }
  };

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
      setTimeout(() => {
        setImportSuccess(false);
      }, 2000);
    }
  };

  const handlePreviewMcpTool = (tool: McpTool) => {
    // Create a preview-like structure for MCP tools
    setPreview({
      metadata: {
        name: tool.name,
        version: "1.0.0",
        description: tool.description,
        author: "MCP Server",
        tags: ["mcp", "imported"],
        permissions: ["network"],
        parameters: Object.entries(
          (tool.inputSchema as any)?.properties || {}
        ).map(([name, prop]: [string, any]) => ({
          name,
          type: prop.type || "string",
          required: ((tool.inputSchema as any)?.required || []).includes(name),
          description: prop.description || "",
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
      // Reset after a delay
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
    setRegistryPreview(null);
    previewMutation.reset();
    importMutation.reset();
    importRegistryMutation.reset();
    setImportSuccess(false);
  };

  return (
    <div className="flex h-full">
      {/* Import panel */}
      <div className="w-96 border-r border-border-default bg-bg-secondary p-4">
        <h2 className="text-sm font-medium text-text-primary mb-4">
          Import Skill
        </h2>

        {/* Source selection */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <SourceButton
            icon={<Link className="h-5 w-5" />}
            label="URL"
            description="Direct link"
            selected={importSource === "url"}
            onClick={() => setImportSource("url")}
          />
          <SourceButton
            icon={<Github className="h-5 w-5" />}
            label="GitHub"
            description="Repository"
            selected={importSource === "github"}
            onClick={() => setImportSource("github")}
          />
          <SourceButton
            icon={<Server className="h-5 w-5" />}
            label="MCP"
            description="Server"
            selected={importSource === "mcp"}
            onClick={() => setImportSource("mcp")}
          />
          <SourceButton
            icon={<Globe className="h-5 w-5" />}
            label="Registry"
            description="Browse"
            selected={importSource === "registry"}
            onClick={() => setImportSource("registry")}
          />
        </div>

        {/* URL input */}
        {importSource === "url" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                URL Address
              </label>
              <Input
                placeholder="https://example.com/skill.md"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePreview()}
              />
            </div>

            {!libraryPath && (
              <div className="flex items-start gap-2 text-xs text-accent-yellow">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Please set a library path in Settings first</span>
              </div>
            )}

            <div className="flex items-start gap-2 text-xs text-text-muted">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Please verify the source is trustworthy before importing</span>
            </div>

            <Button
              className="w-full"
              disabled={!url || !libraryPath || previewMutation.isPending}
              onClick={handlePreview}
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Preview Content
            </Button>

            {previewMutation.isError && (
              <div className="text-xs text-accent-red">
                {String(previewMutation.error)}
              </div>
            )}
          </div>
        )}

        {importSource === "github" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                Repository URL
              </label>
              <Input
                placeholder="https://github.com/owner/repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGithubConnect()}
              />
            </div>

            {!libraryPath && (
              <div className="flex items-start gap-2 text-xs text-accent-yellow">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Please set a library path in Settings first</span>
              </div>
            )}

            <Button
              className="w-full"
              disabled={!githubUrl || !libraryPath}
              onClick={handleGithubConnect}
            >
              <Github className="h-4 w-4 mr-2" />
              Connect to Repository
            </Button>

            {/* File browser */}
            {browsingEnabled && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {pathHistory.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={handleNavigateBack}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <span className="text-xs text-text-muted">
                      {githubOwner}/{githubRepo}/{githubPath || ""}
                    </span>
                  </div>
                </div>

                {isLoadingGithub ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
                  </div>
                ) : githubError ? (
                  <div className="text-xs text-accent-red py-4">
                    {String(githubError)}
                  </div>
                ) : (
                  <ScrollArea className="h-48 rounded-md border border-border-default">
                    <div className="divide-y divide-border-muted">
                      {githubFiles.map((file) => (
                        <div
                          key={file.path}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-tertiary cursor-pointer",
                            selectedFiles.has(file.path) && "bg-accent-blue/10"
                          )}
                        >
                          {file.fileType === "dir" ? (
                            <button
                              className="flex items-center gap-2 flex-1"
                              onClick={() => handleNavigateToPath(file.path)}
                            >
                              <Folder className="h-3.5 w-3.5 text-accent-yellow" />
                              <span className="text-text-primary">{file.name}</span>
                              <ChevronRight className="h-3.5 w-3.5 text-text-muted ml-auto" />
                            </button>
                          ) : (
                            <>
                              {file.name.endsWith(".md") && (
                                <input
                                  type="checkbox"
                                  checked={selectedFiles.has(file.path)}
                                  onChange={() => handleToggleFileSelection(file.path)}
                                  className="h-3.5 w-3.5"
                                />
                              )}
                              <button
                                className="flex items-center gap-2 flex-1"
                                onClick={() => handlePreviewGithubFile(file)}
                                disabled={!file.name.endsWith(".md")}
                              >
                                <FileText className={cn(
                                  "h-3.5 w-3.5",
                                  file.name.endsWith(".md") ? "text-accent-blue" : "text-text-muted"
                                )} />
                                <span className={cn(
                                  file.name.endsWith(".md") ? "text-text-primary" : "text-text-muted"
                                )}>
                                  {file.name}
                                </span>
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {/* Import actions */}
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={handleImportSelectedFiles}
                    disabled={selectedFiles.size === 0 || importGithubMutation.isPending}
                  >
                    {importGithubMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Import Selected ({selectedFiles.size})
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleImportDirectory}
                    disabled={importDirectoryMutation.isPending}
                  >
                    {importDirectoryMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Folder className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Import All
                  </Button>
                </div>

                {importDirectoryMutation.isSuccess && importDirectoryMutation.data && (
                  <div className="text-xs text-accent-green mt-2">
                    Imported {importDirectoryMutation.data.imported} skills
                    {importDirectoryMutation.data.skipped > 0 && `, skipped ${importDirectoryMutation.data.skipped}`}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {importSource === "mcp" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                MCP Server URL
              </label>
              <Input
                placeholder="http://localhost:3000"
                value={mcpUrl}
                onChange={(e) => setMcpUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnectMcp()}
              />
            </div>

            {!libraryPath && (
              <div className="flex items-start gap-2 text-xs text-accent-yellow">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Please set a library path in Settings first</span>
              </div>
            )}

            <Button
              className="w-full"
              disabled={!mcpUrl || !libraryPath || connectMcpMutation.isPending}
              onClick={handleConnectMcp}
            >
              {connectMcpMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Server className="h-4 w-4 mr-2" />
              )}
              Connect to Server
            </Button>

            {connectMcpMutation.isError && (
              <div className="text-xs text-accent-red">
                {String(connectMcpMutation.error)}
              </div>
            )}

            {/* Tools list */}
            {mcpConnected && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-text-muted">
                    {mcpTools.length} tools available
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
                              onChange={() => handleToggleMcpToolSelection(tool.name)}
                              className="h-3.5 w-3.5"
                            />
                            <button
                              className="flex-1 text-left"
                              onClick={() => handlePreviewMcpTool(tool)}
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
                      onClick={handleImportSelectedMcpTools}
                      disabled={selectedMcpTools.size === 0 || importMcpToolMutation.isPending}
                    >
                      {importMcpToolMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Import Selected ({selectedMcpTools.size})
                    </Button>
                  </>
                ) : (
                  <div className="text-xs text-text-muted text-center py-4">
                    No tools found on this server
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {importSource === "registry" && (
          <div className="space-y-3">
            {/* Registry filter */}
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                Registry Source
              </label>
              <select
                className="w-full h-9 rounded-md border border-border-default bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue"
                value={selectedRegistry || ""}
                onChange={(e) => setSelectedRegistry(e.target.value as McpRegistry || undefined)}
              >
                <option value="">All Registries</option>
                <option value="glama">Glama.ai</option>
                <option value="mcpso">MCP.so</option>
                <option value="mcpserversorg">MCPServers.org</option>
                <option value="smithery">Smithery.ai</option>
              </select>
            </div>

            {/* Search input */}
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                Search MCP Servers
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <Input
                  placeholder="Search servers..."
                  value={registrySearch}
                  onChange={(e) => setRegistrySearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {!libraryPath && (
              <div className="flex items-start gap-2 text-xs text-accent-yellow">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Please set a library path in Settings first</span>
              </div>
            )}

            {/* Servers list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted">
                  {registrySearch ? "Search Results" : "Featured Servers"}
                </span>
                <span className="text-xs text-text-muted">
                  {registryServers.length} servers
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
                            onChange={() => handleToggleRegistrySelection(entry.id)}
                            className="h-3.5 w-3.5 mt-0.5"
                          />
                          <button
                            className="flex-1 text-left"
                            onClick={() => handlePreviewRegistryEntry(entry)}
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
                    onClick={handleImportSelectedRegistryEntries}
                    disabled={selectedRegistryEntries.size === 0 || importRegistryMutation.isPending || !libraryPath}
                  >
                    {importRegistryMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Import Selected ({selectedRegistryEntries.size})
                  </Button>
                </>
              ) : (
                <div className="text-xs text-text-muted text-center py-8">
                  {registrySearch ? "No servers found" : "Loading..."}
                </div>
              )}

              {importRegistryMutation.isError && (
                <div className="text-xs text-accent-red mt-2">
                  {String(importRegistryMutation.error)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Preview/Browse area */}
      <div className="flex-1 p-4">
        {preview ? (
          <div className="h-full flex flex-col">
            {/* Preview header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">
                  {preview.metadata.name}
                </h3>
                <p className="text-sm text-text-muted">
                  {preview.metadata.author ? `by ${preview.metadata.author}` : "Unknown author"} · v{preview.metadata.version}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearPreview}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              {/* Description */}
              <div className="mb-4">
                <h4 className="text-xs font-medium text-text-muted mb-2">Description</h4>
                <Markdown 
                  content={preview.metadata.description || "No description"} 
                  className="text-sm text-text-secondary"
                />
              </div>

              {/* Tags */}
              {preview.metadata.tags.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-medium text-text-muted mb-2">Tags</h4>
                  <div className="flex flex-wrap gap-1">
                    {preview.metadata.tags.map((tag) => (
                      <Badge key={tag} variant="blue" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Permissions */}
              {preview.metadata.permissions.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-medium text-text-muted mb-2">Permissions Required</h4>
                  <div className="rounded-md border border-border-default bg-bg-tertiary p-3 space-y-2">
                    {preview.metadata.permissions.map((permission) => {
                      const level = getPermissionLevel(permission);
                      return (
                        <div key={permission} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                level === "low" && "bg-permission-low",
                                level === "medium" && "bg-permission-medium",
                                level === "high" && "bg-permission-high"
                              )}
                            />
                            <span className="text-xs text-text-primary">{permission}</span>
                          </div>
                          <Badge variant={level} className="text-[10px]">
                            {level === "low" ? "Low Risk" : level === "medium" ? "Medium Risk" : "High Risk"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Parameters */}
              {preview.metadata.parameters.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-medium text-text-muted mb-2">Parameters</h4>
                  <div className="space-y-2">
                    {preview.metadata.parameters.map((param) => (
                      <div key={param.name} className="text-xs">
                        <span className="font-medium text-text-primary">{param.name}</span>
                        <span className="text-text-muted"> ({param.type})</span>
                        {param.required && <span className="text-accent-red"> *</span>}
                        <p className="text-text-secondary mt-0.5">{param.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Source preview */}
              <div className="mb-4">
                <h4 className="text-xs font-medium text-text-muted mb-2">Source Preview</h4>
                <pre className="text-xs text-text-secondary bg-bg-tertiary rounded-md p-3 overflow-x-auto max-h-64">
                  {preview.content.slice(0, 1000)}
                  {preview.content.length > 1000 && "\n\n... (truncated)"}
                </pre>
              </div>
            </ScrollArea>

            {/* Import button */}
            <div className="pt-4 border-t border-border-default">
              {importSuccess ? (
                <Button className="w-full" disabled>
                  <Check className="h-4 w-4 mr-2" />
                  Imported Successfully!
                </Button>
              ) : registryPreview ? (
                <Button
                  className="w-full"
                  onClick={handleImportRegistryEntry}
                  disabled={importRegistryMutation.isPending}
                >
                  {importRegistryMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Import to Library
                </Button>
              ) : (
                <Button
                  className="w-full"
                  onClick={handleImport}
                  disabled={importMutation.isPending}
                >
                  {importMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Import to Library
                </Button>
              )}
              {importMutation.isError && (
                <div className="text-xs text-accent-red mt-2">
                  {String(importMutation.error)}
                </div>
              )}
              {importRegistryMutation.isError && (
                <div className="text-xs text-accent-red mt-2">
                  {String(importRegistryMutation.error)}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-text-muted">
            <div className="text-center">
              <Download className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">Enter a URL to preview the skill</p>
              <p className="text-xs mt-1">
                Supported formats: .md, .json
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface SourceButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

const SourceButton: React.FC<SourceButtonProps> = ({
  icon,
  label,
  description,
  selected,
  onClick,
}) => (
  <button
    className={`flex flex-col items-center justify-center rounded-lg border p-3 transition-colors ${
      selected
        ? "border-accent-blue bg-accent-blue/10"
        : "border-border-default hover:border-border-default/80 hover:bg-bg-tertiary"
    }`}
    onClick={onClick}
  >
    <div className={selected ? "text-accent-blue" : "text-text-muted"}>
      {icon}
    </div>
    <span
      className={`text-xs font-medium mt-1 ${
        selected ? "text-accent-blue" : "text-text-primary"
      }`}
    >
      {label}
    </span>
    <span className="text-[10px] text-text-muted">{description}</span>
  </button>
);
