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
import {
  Button,
  ScrollArea,
  Input,
  Section,
  SidePanel,
  SideNavItem,
  LoadingSpinner,
  Textarea,
  EmptyState,
} from "@/components/ui";
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
  useDetectAiTools,
  useAllSkillInstallations,
  useShowInFolder,
  type DetectedAiTool,
  type InstallTargetKind,
} from "@/hooks";
import type { AIToolInfo, ProjectConfig } from "@/types";
import { AI_TOOLS } from "@/types";
import { cn } from "@/lib/utils";

async function openUrl(url: string): Promise<void> {
  try {
    await invoke("plugin:opener|open_url", { url });
  } catch (error) {
    console.error("Failed to open URL via Tauri:", error);
    window.open(url, "_blank");
  }
}

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
      <SidePanel title={t("aiTools.title")}>
        {tabs.map((tab) => (
          <SideNavItem
            key={tab.id}
            icon={tab.icon}
            label={t(tab.labelKey)}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </SidePanel>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-4xl p-6">{renderContent()}</div>
      </ScrollArea>
    </div>
  );
};

// =========================== Claude Code Panel ===========================
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

  if (isLoading) return <LoadingSpinner fullHeight />;

  return (
    <div className="space-y-6">
      <ToolHeader
        tool={AI_TOOLS.find((t) => t.id === "claudecode")!}
        onRefresh={() => refetch()}
      />

      <Section title={t("aiTools.globalConfig")} description={t("aiTools.claudeGlobalDesc")}>
        <EditorWithSaveBar
          path={config?.globalPath || "~/.claude/CLAUDE.md"}
          value={content}
          onChange={(v) => {
            setContent(v);
            setHasChanges(v !== (config?.globalContent || ""));
          }}
          placeholder={t("aiTools.claudePlaceholder")}
          hasChanges={hasChanges}
          isSaving={saveMutation.isPending}
          onSave={handleSave}
        />
      </Section>

      <Section title={t("aiTools.configFormat")} description={t("aiTools.claudeFormatDesc")}>
        <div className="space-y-2 text-sm text-text-secondary">
          <p>{t("aiTools.claudeFormatTip1")}</p>
          <p>{t("aiTools.claudeFormatTip2")}</p>
          <ul className="list-inside list-disc space-y-1 text-text-muted">
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

// =========================== Cursor Panel ===========================
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

  if (isLoading) return <LoadingSpinner fullHeight />;

  return (
    <div className="space-y-6">
      <ToolHeader
        tool={AI_TOOLS.find((t) => t.id === "cursor")!}
        onRefresh={() => refetch()}
      />

      {config?.globalRules && (
        <Section title={t("aiTools.globalRules")} description={t("aiTools.cursorGlobalDesc")}>
          <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-tertiary p-4 font-mono text-sm text-text-secondary">
            {config.globalRules}
          </div>
          <p className="text-xs text-text-muted">{t("aiTools.cursorGlobalNote")}</p>
        </Section>
      )}

      <Section title={t("aiTools.legacyRules")} description={t("aiTools.cursorLegacyDesc")}>
        <EditorWithSaveBar
          path={config?.legacyRulesPath || "~/.cursorrules"}
          value={content}
          onChange={(v) => {
            setContent(v);
            setHasChanges(v !== (config?.legacyRules || ""));
          }}
          placeholder={t("aiTools.cursorPlaceholder")}
          hasChanges={hasChanges}
          isSaving={saveMutation.isPending}
          onSave={handleSave}
        />
      </Section>

      <Section title={t("aiTools.mdcFormat")} description={t("aiTools.cursorMdcDesc")}>
        <div className="space-y-2 text-sm text-text-secondary">
          <p>{t("aiTools.cursorMdcTip1")}</p>
          <div className="rounded-lg bg-bg-tertiary p-4 font-mono text-xs">
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

// =========================== OpenCode Panel ===========================
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

  if (isLoading) return <LoadingSpinner fullHeight />;

  return (
    <div className="space-y-6">
      <ToolHeader
        tool={AI_TOOLS.find((t) => t.id === "opencode")!}
        onRefresh={() => refetch()}
      />

      <Section title="AGENTS.md" description={t("aiTools.opencodeAgentsDesc")}>
        <EditorWithSaveBar
          path={config?.globalAgentsPath || "~/.config/opencode/AGENTS.md"}
          value={agentsContent}
          onChange={(v) => {
            setAgentsContent(v);
            setAgentsHasChanges(v !== (config?.globalAgentsMd || ""));
          }}
          placeholder={t("aiTools.opencodePlaceholder")}
          hasChanges={agentsHasChanges}
          isSaving={saveAgentsMutation.isPending}
          onSave={async () => {
            try {
              await saveAgentsMutation.mutateAsync(agentsContent);
              setAgentsHasChanges(false);
            } catch (e) {
              console.error("Failed to save:", e);
            }
          }}
        />
      </Section>

      <Section title="opencode.json" description={t("aiTools.opencodeConfigDesc")}>
        <EditorWithSaveBar
          path={config?.globalConfigPath || "~/.config/opencode/opencode.json"}
          value={configContent}
          onChange={(v) => {
            setConfigContent(v);
            setConfigHasChanges(v !== (config?.globalConfigJson || ""));
          }}
          placeholder={`{\n  "$schema": "https://opencode.ai/config.json"\n}`}
          hasChanges={configHasChanges}
          isSaving={saveConfigMutation.isPending}
          onSave={async () => {
            try {
              await saveConfigMutation.mutateAsync(configContent);
              setConfigHasChanges(false);
            } catch (e) {
              console.error("Failed to save:", e);
            }
          }}
        />
      </Section>

      <Section title={t("aiTools.compatibility")} description={t("aiTools.opencodeCompatDesc")}>
        <div className="space-y-2 text-sm text-text-secondary">
          <p>{t("aiTools.opencodeCompatTip1")}</p>
          <p>{t("aiTools.opencodeCompatTip2")}</p>
        </div>
      </Section>
    </div>
  );
};

// =========================== Project Config Panel ===========================
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
    if (path.includes(".cursorrules") || path.includes(".mdc"))
      return <Zap className="h-4 w-4 text-accent-yellow" />;
    if (path.includes("AGENTS.md") || path.includes("opencode"))
      return <Code2 className="h-4 w-4 text-accent-green" />;
    return <FileText className="h-4 w-4 text-text-muted" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{t("aiTools.projectConfig")}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t("aiTools.projectConfigDesc")}</p>
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
            <FolderOpen className="mr-1.5 h-4 w-4" />
            {t("common.browse")}
          </Button>
        </div>
      </Section>

      {projectPath && (
        <>
          <Section title={t("aiTools.detectedConfigs")} description={t("aiTools.detectedConfigsDesc")}>
            {isLoading ? (
              <LoadingSpinner />
            ) : configs && configs.length > 0 ? (
              <div className="space-y-2">
                {configs.map((config) => (
                  <button
                    key={config.configPath}
                    onClick={() => handleEditConfig(config)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 transition-colors ${
                      editingConfig?.configPath === config.configPath
                        ? "border-accent-blue bg-accent-blue/5"
                        : "border-border-default bg-bg-secondary hover:border-border-hover"
                    }`}
                  >
                    {getConfigIcon(config.configPath)}
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-text-primary">
                        {config.configPath.split("/").pop()}
                      </p>
                      <p className="truncate text-xs text-text-muted">{config.configPath}</p>
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
              <EmptyState
                variant="compact"
                title={
                  <span className="inline-flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-text-muted" />
                    {t("aiTools.noConfigsFound")}
                  </span>
                }
              />
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
                <Bot className="mr-1.5 h-4 w-4" />
                CLAUDE.md
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCreateConfig("cursor")}
                disabled={createMutation.isPending}
              >
                <Zap className="mr-1.5 h-4 w-4" />
                .cursorrules
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCreateConfig("opencode")}
                disabled={createMutation.isPending}
              >
                <Code2 className="mr-1.5 h-4 w-4" />
                AGENTS.md
              </Button>
            </div>
          </Section>

          {editingConfig && (
            <Section title={t("aiTools.editConfig")} description={editingConfig.configPath}>
              <EditorWithSaveBar
                path={editingConfig.configPath.split("/").pop() || editingConfig.configPath}
                value={editContent}
                onChange={(v) => {
                  setEditContent(v);
                  setHasChanges(v !== editingConfig.content);
                }}
                placeholder=""
                hasChanges={hasChanges}
                isSaving={saveMutation.isPending}
                onSave={handleSave}
              />
            </Section>
          )}
        </>
      )}
    </div>
  );
};

// =========================== Shared Bits ===========================

interface ToolHeaderProps {
  tool: AIToolInfo;
  onRefresh: () => void;
  /** Which `InstallTargetKind` does this tool correspond to? When provided
   *  we'll show install count + an "open skills folder" shortcut. */
  installKind?: InstallTargetKind;
}

/**
 * Maps the AIToolInfo.id strings we keep in `AI_TOOLS` to the
 * `InstallTargetKind` values the install backend speaks. The two sets diverge
 * slightly (e.g. AIToolInfo includes `opencode`, install backend doesn't
 * surface OpenCode as an install target yet).
 */
function aiToolToInstallKind(id: string): InstallTargetKind | undefined {
  switch (id) {
    case "claudecode":
      return "claude";
    case "cursor":
      return "cursor";
    default:
      return undefined;
  }
}

const ToolHeader: React.FC<ToolHeaderProps> = ({ tool, onRefresh, installKind }) => {
  const { t } = useTranslation();
  const { data: detected = [] } = useDetectAiTools();
  const { data: allInstallations = [] } = useAllSkillInstallations();
  const showInFolder = useShowInFolder();

  // Some panels pass `installKind` explicitly; otherwise we try to infer from
  // the tool id. Keeps the existing call sites (which don't pass installKind)
  // working with no edit.
  const kind = installKind ?? aiToolToInstallKind(tool.id);

  // Detected status + count come from the new `detect_ai_tools` backend.
  const detectedInfo: DetectedAiTool | undefined = kind
    ? detected.find((d) => d.kind === kind)
    : undefined;

  // Count of skills currently symlinked into this AI tool. We count
  // `allInstallations` ourselves rather than depending on `detectedInfo.skillCount`
  // because that field is a raw directory count and includes any pre-existing
  // skills the user installed manually, which double-counts after our backend
  // refreshes its cache.
  const installCount = kind
    ? allInstallations.filter((i) => i.targetKind === kind).length
    : 0;

  const handleOpenFolder = () => {
    if (detectedInfo?.path) {
      showInFolder.mutate(detectedInfo.path);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl leading-none">{tool.icon}</span>
            <h2 className="text-lg font-semibold text-text-primary">{tool.name}</h2>
            {detectedInfo && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  detectedInfo.exists
                    ? "bg-accent-green/15 text-accent-green"
                    : "bg-bg-tertiary text-text-muted"
                )}
              >
                {detectedInfo.exists
                  ? t("integrations.status.detected")
                  : t("integrations.status.notInstalled")}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-text-secondary">{tool.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openUrl(tool.docsUrl)}>
            <ExternalLink className="mr-1.5 h-4 w-4" />
            {t("common.docs")}
          </Button>
        </div>
      </div>

      {/* Status strip: skill count + open folder. Only shown when this tool
          is actually an install target (so OpenCode / project config etc.
          don't get a misleading "0 skills" badge). */}
      {kind && detectedInfo && (
        <div className="flex items-center gap-3 rounded-lg border border-border-default bg-bg-secondary px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-blue/15 text-accent-blue">
            <span className="text-sm font-semibold tabular-nums">
              {installCount}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-text-primary">
              {t("integrations.skills.installedHere", { count: installCount })}
            </div>
            <div className="truncate font-mono text-[11px] text-text-muted">
              {detectedInfo.path}
            </div>
          </div>
          {detectedInfo.exists && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenFolder}
              disabled={showInFolder.isPending}
              title={t("integrations.skills.openFolder")}
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

interface EditorWithSaveBarProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hasChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
}

/**
 * Path label + unsaved indicator + Save button + monospace editor.
 * Used in five places across the AI Tools view — extracted to avoid drift
 * between Claude / Cursor / OpenCode / project-config panels.
 */
const EditorWithSaveBar: React.FC<EditorWithSaveBarProps> = ({
  path,
  value,
  onChange,
  placeholder,
  hasChanges,
  isSaving,
  onSave,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-mono text-xs text-text-muted">{path}</span>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-accent-yellow">
              {t("common.unsavedChanges")}
            </span>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={onSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t("common.save")}
          </Button>
        </div>
      </div>
      <Textarea
        mono
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-80 resize-none"
      />
    </div>
  );
};
