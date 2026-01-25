import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Zap,
  Code2,
  ExternalLink,
  RefreshCw,
  Loader2,
  FileText,
  FolderOpen,
  Check,
  AlertCircle,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button, ScrollArea, Input } from "@/components/ui";
import {
  useClaudeCodeConfig,
  useCursorConfig,
  useOpenCodeConfig,
  useSaveClaudeCodeConfig,
  useSaveCursorLegacyRules,
  useSaveOpenCodeAgentsMd,
  useSaveOpenCodeConfigJson,
  useProjectAIConfigs,
  useSaveProjectConfig,
  useCreateProjectConfig,
} from "@/hooks";
import type { AIToolInfo, ProjectConfig } from "@/types";
import { AI_TOOLS } from "@/types";

// Helper to open URL using Tauri opener plugin
async function openUrl(url: string): Promise<void> {
  try {
    await invoke("plugin:opener|open_url", { url });
  } catch (error) {
    console.error("Failed to open URL via Tauri:", error);
    window.open(url, "_blank");
  }
}

// Helper to open folder dialog via Tauri command
async function openFolderDialog(): Promise<string | null> {
  try {
    const result = await invoke<string | null>("plugin:dialog|open", {
      options: {
        directory: true,
        multiple: false,
        title: "Select Project Directory",
      },
    });
    return result;
  } catch (error) {
    console.error("Dialog error:", error);
    return null;
  }
}

type TabType = "claudecode" | "cursor" | "opencode" | "project";

interface TabInfo {
  id: TabType;
  icon: React.ReactNode;
  labelKey: string;
}

const tabs: TabInfo[] = [
  { id: "claudecode", icon: <Bot className="h-4 w-4" />, labelKey: "aiTools.claudeCode" },
  { id: "cursor", icon: <Zap className="h-4 w-4" />, labelKey: "aiTools.cursor" },
  { id: "opencode", icon: <Code2 className="h-4 w-4" />, labelKey: "aiTools.opencode" },
  { id: "project", icon: <FolderOpen className="h-4 w-4" />, labelKey: "aiTools.projectConfig" },
];

export const AIToolsView: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>("claudecode");

  const renderContent = () => {
    switch (activeTab) {
      case "claudecode":
        return <ClaudeCodePanel />;
      case "cursor":
        return <CursorPanel />;
      case "opencode":
        return <OpenCodePanel />;
      case "project":
        return <ProjectConfigPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      {/* Left sidebar menu */}
      <div className="w-56 border-r border-border-default bg-bg-secondary/50 p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-4 px-2">
          {t("aiTools.title")}
        </h2>
        <nav className="space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-accent-blue/10 text-accent-blue"
                  : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              }`}
            >
              {tab.icon}
              <span>{t(tab.labelKey)}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Right content area */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl p-6">{renderContent()}</div>
      </ScrollArea>
    </div>
  );
};

// ========== Claude Code Panel ==========
const ClaudeCodePanel: React.FC = () => {
  const { t } = useTranslation();
  const { data: config, isLoading, refetch } = useClaudeCodeConfig();
  const saveMutation = useSaveClaudeCodeConfig();
  const [content, setContent] = useState<string>("");
  const [hasChanges, setHasChanges] = useState(false);

  React.useEffect(() => {
    if (config?.globalContent) {
      setContent(config.globalContent);
      setHasChanges(false);
    }
  }, [config?.globalContent]);

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync(content);
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save:", error);
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    setHasChanges(value !== (config?.globalContent || ""));
  };

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      <ToolHeader
        tool={AI_TOOLS.find((t) => t.id === "claudecode")!}
        onRefresh={() => refetch()}
      />

      <Section title={t("aiTools.globalConfig")} description={t("aiTools.claudeGlobalDesc")}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted font-mono">
              {config?.globalPath || "~/.claude/CLAUDE.md"}
            </span>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <span className="text-xs text-accent-yellow">{t("common.unsavedChanges")}</span>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t("common.save")}
              </Button>
            </div>
          </div>
          <ConfigEditor
            value={content}
            onChange={handleContentChange}
            placeholder={t("aiTools.claudePlaceholder")}
          />
        </div>
      </Section>

      <Section title={t("aiTools.configFormat")} description={t("aiTools.claudeFormatDesc")}>
        <div className="text-sm text-text-secondary space-y-2">
          <p>{t("aiTools.claudeFormatTip1")}</p>
          <p>{t("aiTools.claudeFormatTip2")}</p>
          <ul className="list-disc list-inside space-y-1 text-text-muted">
            <li>Overview - {t("aiTools.sectionOverview")}</li>
            <li>Tech Stack - {t("aiTools.sectionTechStack")}</li>
            <li>Key Directories - {t("aiTools.sectionKeyDirs")}</li>
            <li>Standards - {t("aiTools.sectionStandards")}</li>
            <li>Common Commands - {t("aiTools.sectionCommands")}</li>
          </ul>
        </div>
      </Section>
    </div>
  );
};

// ========== Cursor Panel ==========
const CursorPanel: React.FC = () => {
  const { t } = useTranslation();
  const { data: config, isLoading, refetch } = useCursorConfig();
  const saveMutation = useSaveCursorLegacyRules();
  const [content, setContent] = useState<string>("");
  const [hasChanges, setHasChanges] = useState(false);

  React.useEffect(() => {
    if (config?.legacyRules) {
      setContent(config.legacyRules);
      setHasChanges(false);
    }
  }, [config?.legacyRules]);

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync(content);
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save:", error);
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    setHasChanges(value !== (config?.legacyRules || ""));
  };

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      <ToolHeader
        tool={AI_TOOLS.find((t) => t.id === "cursor")!}
        onRefresh={() => refetch()}
      />

      {config?.globalRules && (
        <Section title={t("aiTools.globalRules")} description={t("aiTools.cursorGlobalDesc")}>
          <div className="bg-bg-tertiary rounded-lg p-4 text-sm text-text-secondary font-mono whitespace-pre-wrap max-h-48 overflow-auto">
            {config.globalRules}
          </div>
          <p className="text-xs text-text-muted mt-2">{t("aiTools.cursorGlobalNote")}</p>
        </Section>
      )}

      <Section title={t("aiTools.legacyRules")} description={t("aiTools.cursorLegacyDesc")}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted font-mono">
              {config?.legacyRulesPath || "~/.cursorrules"}
            </span>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <span className="text-xs text-accent-yellow">{t("common.unsavedChanges")}</span>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t("common.save")}
              </Button>
            </div>
          </div>
          <ConfigEditor
            value={content}
            onChange={handleContentChange}
            placeholder={t("aiTools.cursorPlaceholder")}
          />
        </div>
      </Section>

      <Section title={t("aiTools.mdcFormat")} description={t("aiTools.cursorMdcDesc")}>
        <div className="text-sm text-text-secondary space-y-2">
          <p>{t("aiTools.cursorMdcTip1")}</p>
          <div className="bg-bg-tertiary rounded-lg p-4 font-mono text-xs">
            <pre>{`---
description: Short description of the rule
globs: src/**/*.ts
alwaysApply: false
---
# Rule Title
Main rule content...`}</pre>
          </div>
          <p className="text-text-muted">{t("aiTools.cursorMdcTip2")}</p>
        </div>
      </Section>
    </div>
  );
};

// ========== OpenCode Panel ==========
const OpenCodePanel: React.FC = () => {
  const { t } = useTranslation();
  const { data: config, isLoading, refetch } = useOpenCodeConfig();
  const saveAgentsMutation = useSaveOpenCodeAgentsMd();
  const saveConfigMutation = useSaveOpenCodeConfigJson();
  const [agentsContent, setAgentsContent] = useState<string>("");
  const [configContent, setConfigContent] = useState<string>("");
  const [agentsHasChanges, setAgentsHasChanges] = useState(false);
  const [configHasChanges, setConfigHasChanges] = useState(false);

  React.useEffect(() => {
    if (config?.globalAgentsMd) {
      setAgentsContent(config.globalAgentsMd);
      setAgentsHasChanges(false);
    }
    if (config?.globalConfigJson) {
      setConfigContent(config.globalConfigJson);
      setConfigHasChanges(false);
    }
  }, [config]);

  const handleSaveAgents = async () => {
    try {
      await saveAgentsMutation.mutateAsync(agentsContent);
      setAgentsHasChanges(false);
    } catch (error) {
      console.error("Failed to save:", error);
    }
  };

  const handleSaveConfig = async () => {
    try {
      await saveConfigMutation.mutateAsync(configContent);
      setConfigHasChanges(false);
    } catch (error) {
      console.error("Failed to save:", error);
    }
  };

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      <ToolHeader
        tool={AI_TOOLS.find((t) => t.id === "opencode")!}
        onRefresh={() => refetch()}
      />

      <Section title="AGENTS.md" description={t("aiTools.opencodeAgentsDesc")}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted font-mono">
              {config?.globalAgentsPath || "~/.config/opencode/AGENTS.md"}
            </span>
            <div className="flex items-center gap-2">
              {agentsHasChanges && (
                <span className="text-xs text-accent-yellow">{t("common.unsavedChanges")}</span>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveAgents}
                disabled={!agentsHasChanges || saveAgentsMutation.isPending}
              >
                {saveAgentsMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t("common.save")}
              </Button>
            </div>
          </div>
          <ConfigEditor
            value={agentsContent}
            onChange={(v) => {
              setAgentsContent(v);
              setAgentsHasChanges(v !== (config?.globalAgentsMd || ""));
            }}
            placeholder={t("aiTools.opencodePlaceholder")}
          />
        </div>
      </Section>

      <Section title="opencode.json" description={t("aiTools.opencodeConfigDesc")}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted font-mono">
              {config?.globalConfigPath || "~/.config/opencode/opencode.json"}
            </span>
            <div className="flex items-center gap-2">
              {configHasChanges && (
                <span className="text-xs text-accent-yellow">{t("common.unsavedChanges")}</span>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveConfig}
                disabled={!configHasChanges || saveConfigMutation.isPending}
              >
                {saveConfigMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t("common.save")}
              </Button>
            </div>
          </div>
          <ConfigEditor
            value={configContent}
            onChange={(v) => {
              setConfigContent(v);
              setConfigHasChanges(v !== (config?.globalConfigJson || ""));
            }}
            placeholder='{\n  "$schema": "https://opencode.ai/config.json"\n}'
            language="json"
          />
        </div>
      </Section>

      <Section title={t("aiTools.compatibility")} description={t("aiTools.opencodeCompatDesc")}>
        <div className="text-sm text-text-secondary space-y-2">
          <p>{t("aiTools.opencodeCompatTip1")}</p>
          <p>{t("aiTools.opencodeCompatTip2")}</p>
        </div>
      </Section>
    </div>
  );
};

// ========== Project Config Panel ==========
const ProjectConfigPanel: React.FC = () => {
  const { t } = useTranslation();
  const [projectPath, setProjectPath] = useState<string>("");
  const { data: configs, isLoading, refetch } = useProjectAIConfigs(projectPath);
  const saveMutation = useSaveProjectConfig();
  const createMutation = useCreateProjectConfig();
  const [editingConfig, setEditingConfig] = useState<ProjectConfig | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [hasChanges, setHasChanges] = useState(false);

  const handleSelectFolder = async () => {
    const selected = await openFolderDialog();
    if (selected) {
      setProjectPath(selected);
      setEditingConfig(null);
    }
  };

  const handleEditConfig = (config: ProjectConfig) => {
    setEditingConfig(config);
    setEditContent(config.content);
    setHasChanges(false);
  };

  const handleSave = async () => {
    if (!editingConfig) return;
    try {
      await saveMutation.mutateAsync({
        configPath: editingConfig.configPath,
        content: editContent,
      });
      setHasChanges(false);
      refetch();
    } catch (error) {
      console.error("Failed to save:", error);
    }
  };

  const handleCreateConfig = async (configType: string) => {
    if (!projectPath) return;
    try {
      const newConfig = await createMutation.mutateAsync({ projectPath, configType });
      setEditingConfig(newConfig);
      setEditContent(newConfig.content);
      setHasChanges(false);
      refetch();
    } catch (error) {
      console.error("Failed to create config:", error);
    }
  };

  const getConfigIcon = (path: string) => {
    if (path.includes("CLAUDE.md")) return <Bot className="h-4 w-4 text-accent-blue" />;
    if (path.includes(".cursorrules") || path.includes(".mdc")) return <Zap className="h-4 w-4 text-accent-yellow" />;
    if (path.includes("AGENTS.md") || path.includes("opencode")) return <Code2 className="h-4 w-4 text-accent-green" />;
    return <FileText className="h-4 w-4 text-text-muted" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{t("aiTools.projectConfig")}</h2>
        <p className="text-sm text-text-secondary mt-1">{t("aiTools.projectConfigDesc")}</p>
      </div>

      <Section title={t("aiTools.selectProject")} description={t("aiTools.selectProjectDesc")}>
        <div className="flex items-center gap-3">
          <Input
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            placeholder="/path/to/your/project"
            className="flex-1"
          />
          <Button variant="secondary" size="sm" onClick={handleSelectFolder}>
            <FolderOpen className="h-4 w-4 mr-1.5" />
            {t("common.browse")}
          </Button>
        </div>
      </Section>

      {projectPath && (
        <>
          <Section title={t("aiTools.detectedConfigs")} description={t("aiTools.detectedConfigsDesc")}>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
              </div>
            ) : configs && configs.length > 0 ? (
              <div className="space-y-2">
                {configs.map((config) => (
                  <button
                    key={config.configPath}
                    onClick={() => handleEditConfig(config)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      editingConfig?.configPath === config.configPath
                        ? "border-accent-blue bg-accent-blue/5"
                        : "border-border-default hover:border-border-hover bg-bg-secondary"
                    }`}
                  >
                    {getConfigIcon(config.configPath)}
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-text-primary">
                        {config.configPath.split("/").pop()}
                      </p>
                      <p className="text-xs text-text-muted truncate">
                        {config.configPath}
                      </p>
                    </div>
                    {config.lastModified && (
                      <span className="text-xs text-text-muted">
                        {new Date(config.lastModified).toLocaleDateString()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 text-text-muted mx-auto mb-2" />
                <p className="text-sm text-text-secondary">{t("aiTools.noConfigsFound")}</p>
              </div>
            )}
          </Section>

          <Section title={t("aiTools.createConfig")} description={t("aiTools.createConfigDesc")}>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCreateConfig("claude")}
                disabled={createMutation.isPending}
              >
                <Bot className="h-4 w-4 mr-1.5" />
                CLAUDE.md
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCreateConfig("cursor")}
                disabled={createMutation.isPending}
              >
                <Zap className="h-4 w-4 mr-1.5" />
                .cursorrules
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCreateConfig("opencode")}
                disabled={createMutation.isPending}
              >
                <Code2 className="h-4 w-4 mr-1.5" />
                AGENTS.md
              </Button>
            </div>
          </Section>

          {editingConfig && (
            <Section
              title={t("aiTools.editConfig")}
              description={editingConfig.configPath}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">
                    {editingConfig.configPath.split("/").pop()}
                  </span>
                  <div className="flex items-center gap-2">
                    {hasChanges && (
                      <span className="text-xs text-accent-yellow">{t("common.unsavedChanges")}</span>
                    )}
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSave}
                      disabled={!hasChanges || saveMutation.isPending}
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {t("common.save")}
                    </Button>
                  </div>
                </div>
                <ConfigEditor
                  value={editContent}
                  onChange={(v) => {
                    setEditContent(v);
                    setHasChanges(v !== editingConfig.content);
                  }}
                  placeholder=""
                />
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
};

// ========== Shared Components ==========

const LoadingState: React.FC = () => (
  <div className="flex items-center justify-center h-64">
    <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
  </div>
);

interface ToolHeaderProps {
  tool: AIToolInfo;
  onRefresh: () => void;
}

const ToolHeader: React.FC<ToolHeaderProps> = ({ tool, onRefresh }) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{tool.icon}</span>
          <h2 className="text-lg font-semibold text-text-primary">{tool.name}</h2>
        </div>
        <p className="text-sm text-text-secondary mt-1">{tool.description}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => openUrl(tool.docsUrl)}>
          <ExternalLink className="h-4 w-4 mr-1.5" />
          {t("common.docs")}
        </Button>
      </div>
    </div>
  );
};

interface SectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, description, children }) => (
  <div className="space-y-3">
    <div>
      <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
    </div>
    {children}
  </div>
);

interface ConfigEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  language?: "markdown" | "json";
}

const ConfigEditor: React.FC<ConfigEditorProps> = ({
  value,
  onChange,
  placeholder,
  language: _language = "markdown",
}) => {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-80 p-4 rounded-lg border border-border-default bg-bg-tertiary text-text-primary font-mono text-sm resize-none focus:border-accent-blue focus:outline-none"
      spellCheck={false}
    />
  );
};
