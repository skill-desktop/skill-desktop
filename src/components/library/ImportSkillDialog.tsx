import React from "react";
import { useTranslation } from "react-i18next";
import { Link, Github, Server, Globe, BookOpen, Loader2, Check, AlertCircle, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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

// Example skills configuration
import {
  Palette,
  Code,
  TestTube,
  Sparkles,
  FileCode,
  Layers,
} from "lucide-react";

interface ExampleSkill {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  tags: string[];
  license: string;
}

const EXAMPLE_SKILLS: ExampleSkill[] = [
  {
    id: "frontend-design",
    name: "Frontend Design",
    description: "Create distinctive, production-grade frontend interfaces with high design quality.",
    icon: <Palette className="w-4 h-4" />,
    path: "skills/frontend-design",
    tags: ["design", "frontend", "ui"],
    license: "Apache-2.0",
  },
  {
    id: "mcp-builder",
    name: "MCP Builder",
    description: "Guide for creating high-quality MCP servers that enable LLMs to interact with external services.",
    icon: <Code className="w-4 h-4" />,
    path: "skills/mcp-builder",
    tags: ["mcp", "development", "api"],
    license: "Apache-2.0",
  },
  {
    id: "webapp-testing",
    name: "Web App Testing",
    description: "Toolkit for interacting with and testing local web applications using Playwright.",
    icon: <TestTube className="w-4 h-4" />,
    path: "skills/webapp-testing",
    tags: ["testing", "playwright", "automation"],
    license: "Apache-2.0",
  },
  {
    id: "algorithmic-art",
    name: "Algorithmic Art",
    description: "Creating algorithmic art using p5.js with seeded randomness.",
    icon: <Sparkles className="w-4 h-4" />,
    path: "skills/algorithmic-art",
    tags: ["art", "generative", "p5js"],
    license: "Apache-2.0",
  },
  {
    id: "skill-creator",
    name: "Skill Creator",
    description: "Guide for creating effective skills that extend Claude's capabilities.",
    icon: <FileCode className="w-4 h-4" />,
    path: "skills/skill-creator",
    tags: ["meta", "skill", "guide"],
    license: "Apache-2.0",
  },
  {
    id: "theme-factory",
    name: "Theme Factory",
    description: "Create cohesive visual themes for presentations, documents, and web interfaces.",
    icon: <Layers className="w-4 h-4" />,
    path: "skills/theme-factory",
    tags: ["design", "theme", "styling"],
    license: "Apache-2.0",
  },
];

const GITHUB_REPO = {
  owner: "anthropics",
  repo: "skills",
  branch: "main",
};

type ExtendedImportSource = ImportSource | "examples";

interface ImportSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportSkillDialog({ open, onOpenChange }: ImportSkillDialogProps) {
  const { t } = useTranslation();
  const [importSource, setImportSource] = React.useState<ExtendedImportSource>("examples");
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

  // Example skills state
  const [importingIds, setImportingIds] = React.useState<Set<string>>(new Set());
  const [importedIds, setImportedIds] = React.useState<Set<string>>(new Set());
  const [exampleErrors, setExampleErrors] = React.useState<Record<string, string>>({});

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

  // Example skills handlers
  const handleImportExample = React.useCallback(async (skill: ExampleSkill) => {
    setImportingIds(prev => new Set(prev).add(skill.id));
    setExampleErrors(prev => {
      const next = { ...prev };
      delete next[skill.id];
      return next;
    });

    try {
      await importGithubMutation.mutateAsync({
        owner: GITHUB_REPO.owner,
        repo: GITHUB_REPO.repo,
        path: skill.path,
        branch: GITHUB_REPO.branch,
      });
      setImportedIds(prev => new Set(prev).add(skill.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      setExampleErrors(prev => ({ ...prev, [skill.id]: message }));
    } finally {
      setImportingIds(prev => {
        const next = new Set(prev);
        next.delete(skill.id);
        return next;
      });
    }
  }, [importGithubMutation]);

  const handleImportAllExamples = React.useCallback(async () => {
    for (const skill of EXAMPLE_SKILLS) {
      if (!importedIds.has(skill.id) && !importingIds.has(skill.id)) {
        await handleImportExample(skill);
      }
    }
  }, [importedIds, importingIds, handleImportExample]);

  const sources = [
    { id: "examples", icon: BookOpen, label: t("library.exampleSkills") },
    { id: "url", icon: Link, label: t("hub.source.url") },
    { id: "github", icon: Github, label: t("hub.source.github") },
    { id: "mcp", icon: Server, label: t("hub.source.mcp") },
    { id: "registry", icon: Globe, label: t("hub.source.registry") },
  ] as const;

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
          {/* 1. Source Sidebar */}
          <div className="w-[200px] border-r border-border-default bg-bg-secondary flex flex-col">
            <div className="p-2 space-y-1">
              {sources.map((source) => {
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
          </div>

          {/* 2. Configuration Area */}
          <div className="w-[340px] border-r border-border-default flex flex-col bg-bg-primary">
            <ScrollArea className="flex-1">
              <div className="p-4">
                {importSource === "examples" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">{t("library.exampleSkills")}</h3>
                      <a
                        href="https://github.com/anthropics/skills"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1"
                      >
                        anthropics/skills
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    
                    <div className="space-y-2">
                      {EXAMPLE_SKILLS.map((skill) => {
                        const isImporting = importingIds.has(skill.id);
                        const isImported = importedIds.has(skill.id);
                        const error = exampleErrors[skill.id];

                        return (
                          <div
                            key={skill.id}
                            className={`group relative rounded-lg border p-3 transition-all ${
                              isImported
                                ? "bg-accent-green/5 border-accent-green/20"
                                : "bg-bg-secondary/50 border-border-muted hover:border-border-default hover:bg-bg-secondary"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-md ${
                                isImported 
                                  ? "bg-accent-green/10 text-accent-green"
                                  : "bg-bg-elevated text-text-muted"
                              }`}>
                                {isImported ? <Check className="w-4 h-4" /> : skill.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-medium truncate">{skill.name}</span>
                                  <Badge variant="outline" className="text-[10px] h-4 px-1 py-0">{skill.license}</Badge>
                                </div>
                                <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                                  {skill.description}
                                </p>
                              </div>
                            </div>
                            
                            <div className="mt-3 flex items-center justify-end gap-2">
                              {error && (
                                <span className="text-[10px] text-destructive flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  Import failed
                                </span>
                              )}
                              <Button
                                size="sm"
                                variant={isImported ? "outline" : "default"}
                                className={`h-7 text-xs ${isImported ? "text-accent-green border-accent-green/30 hover:bg-accent-green/5" : ""}`}
                                onClick={() => handleImportExample(skill)}
                                disabled={isImporting || isImported}
                              >
                                {isImporting ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : isImported ? (
                                  <Check className="w-3 h-3 mr-1" />
                                ) : null}
                                {isImporting ? "Importing..." : isImported ? "Imported" : "Import"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <Button
                      className="w-full"
                      variant="secondary"
                      onClick={handleImportAllExamples}
                      disabled={importedIds.size === EXAMPLE_SKILLS.length || importingIds.size > 0}
                    >
                      {importingIds.size > 0 ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t("exampleSkills.importing")}
                        </>
                      ) : (
                        t("exampleSkills.importAll")
                      )}
                    </Button>
                  </div>
                )}

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
            </ScrollArea>
          </div>

          {/* 3. Preview Area */}
          <div className="flex-1 flex flex-col bg-bg-tertiary/30 overflow-hidden">
            {importSource !== "examples" ? (
              <SkillPreviewPanel
                preview={preview}
                onClearPreview={clearPreview}
                importSuccess={importSuccess}
                isImporting={registryPreview ? importRegistryMutation.isPending : importMutation.isPending}
                importError={registryPreview ? importRegistryMutation.error : importMutation.error}
                onImport={registryPreview ? handleImportRegistryEntry : handleImport}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-text-muted p-8">
                <div className="w-16 h-16 rounded-2xl bg-bg-elevated flex items-center justify-center mb-4">
                  <BookOpen className="h-8 w-8 opacity-50" />
                </div>
                <h3 className="text-lg font-medium text-text-primary mb-2">Example Skills</h3>
                <p className="text-sm max-w-[280px]">
                  Select an example skill from the list to preview its details and import it into your library.
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
