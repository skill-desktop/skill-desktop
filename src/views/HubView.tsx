import React from "react";
import { useTranslation } from "react-i18next";
import { Link, Github, Server, Globe } from "lucide-react";
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
import {
  SourceButton,
  UrlImportPanel,
  GitHubImportPanel,
  McpImportPanel,
  RegistryImportPanel,
  SkillPreviewPanel,
  type ImportSource,
  type PreviewData,
  type GitHubFileEntry,
  type McpTool,
} from "@/components/hub";

export const HubView: React.FC = () => {
  const { t } = useTranslation();
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

    for (const entryId of selectedRegistryEntries) {
      const entry = registryServers.find((e) => e.id === entryId);
      if (!entry) continue;

      try {
        await importRegistryMutation.mutateAsync(entry);
        successCount++;
      } catch (error) {
        console.error(`Failed to import ${entry.name}:`, error);
      }
    }

    if (successCount > 0) {
      setImportSuccess(true);
      setSelectedRegistryEntries(new Set());
      setTimeout(() => setImportSuccess(false), 2000);
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
          {t("hub.title")}
        </h2>

        {/* Source selection */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <SourceButton
            icon={<Link className="h-5 w-5" />}
            label={t("hub.source.url")}
            description={t("hub.source.urlDesc")}
            selected={importSource === "url"}
            onClick={() => setImportSource("url")}
          />
          <SourceButton
            icon={<Github className="h-5 w-5" />}
            label={t("hub.source.github")}
            description={t("hub.source.githubDesc")}
            selected={importSource === "github"}
            onClick={() => setImportSource("github")}
          />
          <SourceButton
            icon={<Server className="h-5 w-5" />}
            label={t("hub.source.mcp")}
            description={t("hub.source.mcpDesc")}
            selected={importSource === "mcp"}
            onClick={() => setImportSource("mcp")}
          />
          <SourceButton
            icon={<Globe className="h-5 w-5" />}
            label={t("hub.source.registry")}
            description={t("hub.source.registryDesc")}
            selected={importSource === "registry"}
            onClick={() => setImportSource("registry")}
          />
        </div>

        {/* URL import */}
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

        {/* GitHub import */}
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

        {/* MCP import */}
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

        {/* Registry import */}
        {importSource === "registry" && (
          <RegistryImportPanel
            libraryPath={libraryPath}
            selectedRegistry={selectedRegistry}
            onRegistryChange={setSelectedRegistry}
            registrySearch={registrySearch}
            onSearchChange={setRegistrySearch}
            registryServers={registryServers}
            isLoadingFeatured={isLoadingFeatured}
            isSearching={isSearching}
            selectedRegistryEntries={selectedRegistryEntries}
            onToggleSelection={handleToggleRegistrySelection}
            onPreviewEntry={handlePreviewRegistryEntry}
            onImportSelected={handleImportSelectedRegistryEntries}
            isImporting={importRegistryMutation.isPending}
            importError={importRegistryMutation.error}
          />
        )}
      </div>

      {/* Preview/Browse area */}
      <div className="flex-1 p-4">
        <SkillPreviewPanel
          preview={preview}
          onClearPreview={clearPreview}
          importSuccess={importSuccess}
          isImporting={registryPreview ? importRegistryMutation.isPending : importMutation.isPending}
          importError={registryPreview ? importRegistryMutation.error : importMutation.error}
          onImport={registryPreview ? handleImportRegistryEntry : handleImport}
        />
      </div>
    </div>
  );
};
