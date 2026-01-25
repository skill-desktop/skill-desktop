import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Terminal,
  Copy,
  FileCode,
  ExternalLink,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Input, Switch } from "@/components/ui";
import { useSettingsStore } from "@/stores";
import {
  type CLIToolConfig,
  type CLIToolType,
  CLI_TOOL_PRESETS,
  createCLIToolConfig,
  generateShellExports,
  getCLIEnvVars,
} from "@/types/cli";

// CLI 工具类型标签
const CLI_TYPE_LABELS: Record<CLIToolType, string> = {
  claude_code: "Claude Code",
  gemini_cli: "Gemini CLI",
  codex: "OpenAI Codex",
  opencode: "OpenCode",
  aider: "Aider",
  continue: "Continue.dev",
  custom: "Custom",
};

// CLI 工具文档链接
const CLI_DOCS_LINKS: Partial<Record<CLIToolType, string>> = {
  claude_code: "https://docs.anthropic.com/en/docs/claude-code",
  gemini_cli: "https://github.com/google-gemini/gemini-cli",
  codex: "https://github.com/openai/codex",
  opencode: "https://opencode.ai/docs",
  aider: "https://aider.chat/docs",
  continue: "https://docs.continue.dev",
};

export const CLISettingsPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    cliSettings,
    addCLITool,
    updateCLITool,
    removeCLITool,
  } = useSettingsStore();

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [applyResult, setApplyResult] = useState<Record<string, { success: boolean; message: string }>>({});

  // 新工具表单状态
  const [newTool, setNewTool] = useState<CLIToolConfig>(() =>
    createCLIToolConfig()
  );

  const handleAddFromPreset = (presetKey: string) => {
    const config = createCLIToolConfig(presetKey as keyof typeof CLI_TOOL_PRESETS);
    setNewTool(config);
    setIsAddingNew(true);
  };

  const handleAddCustom = () => {
    setNewTool(createCLIToolConfig());
    setIsAddingNew(true);
  };

  const handleSaveNew = () => {
    if (!newTool.name || !newTool.env_config.api_key_env) {
      return;
    }
    addCLITool(newTool);
    setIsAddingNew(false);
    setNewTool(createCLIToolConfig());
  };

  const handleCancelNew = () => {
    setIsAddingNew(false);
    setNewTool(createCLIToolConfig());
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t("settings.cli.confirmDelete"))) {
      removeCLITool(id);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const toggleShowApiKey = (id: string) => {
    setShowApiKey((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 复制环境变量到剪贴板
  const handleCopyEnvVars = async (tool: CLIToolConfig) => {
    const envVars = getCLIEnvVars(tool);
    const exports = Object.entries(envVars)
      .map(([key, value]) => `export ${key}="${value}"`)
      .join("\n");
    
    try {
      await navigator.clipboard.writeText(exports);
      setApplyResult((prev) => ({
        ...prev,
        [tool.id]: {
          success: true,
          message: t("settings.cli.copiedToClipboard"),
        },
      }));
      // 3秒后清除消息
      setTimeout(() => {
        setApplyResult((prev) => {
          const newResult = { ...prev };
          delete newResult[tool.id];
          return newResult;
        });
      }, 3000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // 导出所有配置
  const handleExportAll = async () => {
    const enabledTools = cliSettings.tools.filter((t) => t.enabled);
    const exports = generateShellExports(enabledTools);
    
    try {
      await navigator.clipboard.writeText(exports);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // 打开文档链接
  const handleOpenDocs = async (type: CLIToolType) => {
    const url = CLI_DOCS_LINKS[type];
    if (url) {
      try {
        await invoke("plugin:opener|open_url", { url });
      } catch (error) {
        window.open(url, "_blank");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">
          {t("settings.cli.title")}
        </h2>
        <p className="text-sm text-text-muted">
          {t("settings.cli.description")}
        </p>
      </div>

      {/* 快速添加预设 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">
          {t("settings.cli.quickAdd")}
        </h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CLI_TOOL_PRESETS).map(([key, preset]) => (
            <Button
              key={key}
              variant="secondary"
              size="sm"
              onClick={() => handleAddFromPreset(key)}
              disabled={isAddingNew}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {preset.name}
            </Button>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAddCustom}
            disabled={isAddingNew}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t("settings.cli.custom")}
          </Button>
        </div>
      </div>

      {/* 添加新工具表单 */}
      {isAddingNew && (
        <div className="border border-border-default rounded-lg p-4 bg-bg-secondary/50 space-y-4">
          <h3 className="text-sm font-medium text-text-primary">
            {t("settings.cli.addTool")}
          </h3>
          
          <CLIToolForm
            tool={newTool}
            onChange={setNewTool}
            showApiKey={showApiKey["new"] || false}
            onToggleApiKey={() => toggleShowApiKey("new")}
          />

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={handleCancelNew}>
              <X className="h-3.5 w-3.5 mr-1" />
              {t("common.cancel")}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveNew}
              disabled={!newTool.name || !newTool.env_config.api_key_env}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {t("common.save")}
            </Button>
          </div>
        </div>
      )}

      {/* 全局设置 */}
      <div className="border border-border-default rounded-lg p-4 bg-bg-secondary/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-text-primary">
              {t("settings.cli.exportAll")}
            </h3>
            <p className="text-xs text-text-muted mt-1">
              {t("settings.cli.exportAllDesc")}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportAll}
            disabled={cliSettings.tools.filter((t) => t.enabled).length === 0}
          >
            <FileCode className="h-3.5 w-3.5 mr-1" />
            {t("settings.cli.exportShellConfig")}
          </Button>
        </div>
      </div>

      {/* 工具列表 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">
          {t("settings.cli.configuredTools")}
          {cliSettings.tools.length > 0 && (
            <span className="text-text-muted ml-2">
              ({cliSettings.tools.length})
            </span>
          )}
        </h3>

        {cliSettings.tools.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <Terminal className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t("settings.cli.noTools")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cliSettings.tools.map((tool) => (
              <CLIToolCard
                key={tool.id}
                tool={tool}
                isExpanded={expandedId === tool.id}
                isEditing={editingId === tool.id}
                applyResult={applyResult[tool.id]}
                showApiKey={showApiKey[tool.id] || false}
                onToggleExpand={() => toggleExpand(tool.id)}
                onToggleApiKey={() => toggleShowApiKey(tool.id)}
                onEdit={() => setEditingId(tool.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={(updates) => {
                  updateCLITool(tool.id, updates);
                  setEditingId(null);
                }}
                onDelete={() => handleDelete(tool.id)}
                onToggleEnabled={(enabled) =>
                  updateCLITool(tool.id, { enabled })
                }
                onCopyEnvVars={() => handleCopyEnvVars(tool)}
                onOpenDocs={() => handleOpenDocs(tool.type)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// CLI 工具表单组件
interface CLIToolFormProps {
  tool: CLIToolConfig;
  onChange: (tool: CLIToolConfig) => void;
  showApiKey: boolean;
  onToggleApiKey: () => void;
}

const CLIToolForm: React.FC<CLIToolFormProps> = ({
  tool,
  onChange,
  showApiKey,
  onToggleApiKey,
}) => {
  const { t } = useTranslation();

  const handleChange = (field: keyof CLIToolConfig, value: unknown) => {
    onChange({ ...tool, [field]: value });
  };

  const handleEnvConfigChange = (field: string, value: string) => {
    onChange({
      ...tool,
      env_config: {
        ...tool.env_config,
        [field]: value,
      },
    });
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 sm:col-span-1">
        <label className="block text-xs text-text-muted mb-1">
          {t("settings.cli.toolName")}
        </label>
        <Input
          value={tool.name}
          onChange={(e) => handleChange("name", e.target.value)}
          placeholder="My CLI Tool"
        />
      </div>

      <div className="col-span-2 sm:col-span-1">
        <label className="block text-xs text-text-muted mb-1">
          {t("settings.cli.toolType")}
        </label>
        <select
          value={tool.type}
          onChange={(e) => handleChange("type", e.target.value as CLIToolType)}
          className="w-full h-9 rounded-md border border-border-default bg-bg-secondary px-3 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
        >
          {Object.entries(CLI_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-2">
        <label className="block text-xs text-text-muted mb-1">
          {t("settings.cli.apiKey")}
        </label>
        <div className="relative">
          <Input
            type={showApiKey ? "text" : "password"}
            value={tool.api_key}
            onChange={(e) => handleChange("api_key", e.target.value)}
            placeholder="sk-..."
            className="pr-10"
          />
          <button
            type="button"
            onClick={onToggleApiKey}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            {showApiKey ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="col-span-2 sm:col-span-1">
        <label className="block text-xs text-text-muted mb-1">
          {t("settings.cli.baseUrl")} ({t("common.optional")})
        </label>
        <Input
          value={tool.base_url || ""}
          onChange={(e) => handleChange("base_url", e.target.value)}
          placeholder="https://api.example.com/v1"
        />
      </div>

      <div className="col-span-2 sm:col-span-1">
        <label className="block text-xs text-text-muted mb-1">
          {t("settings.cli.defaultModel")} ({t("common.optional")})
        </label>
        <Input
          value={tool.default_model || ""}
          onChange={(e) => handleChange("default_model", e.target.value)}
          placeholder="gpt-4o"
        />
      </div>

      <div className="col-span-2 border-t border-border-default pt-4 mt-2">
        <h4 className="text-xs font-medium text-text-primary mb-3">
          {t("settings.cli.envVarConfig")}
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">
              {t("settings.cli.apiKeyEnvVar")}
            </label>
            <Input
              value={tool.env_config.api_key_env}
              onChange={(e) => handleEnvConfigChange("api_key_env", e.target.value)}
              placeholder="OPENAI_API_KEY"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">
              {t("settings.cli.baseUrlEnvVar")} ({t("common.optional")})
            </label>
            <Input
              value={tool.env_config.base_url_env || ""}
              onChange={(e) => handleEnvConfigChange("base_url_env", e.target.value)}
              placeholder="OPENAI_BASE_URL"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// CLI 工具卡片组件
interface CLIToolCardProps {
  tool: CLIToolConfig;
  isExpanded: boolean;
  isEditing: boolean;
  applyResult?: { success: boolean; message: string };
  showApiKey: boolean;
  onToggleExpand: () => void;
  onToggleApiKey: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (updates: Partial<CLIToolConfig>) => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onCopyEnvVars: () => void;
  onOpenDocs: () => void;
}

const CLIToolCard: React.FC<CLIToolCardProps> = ({
  tool,
  isExpanded,
  isEditing,
  applyResult,
  showApiKey,
  onToggleExpand,
  onToggleApiKey,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onToggleEnabled,
  onCopyEnvVars,
  onOpenDocs,
}) => {
  const { t } = useTranslation();
  const [editForm, setEditForm] = useState<CLIToolConfig>(tool);

  React.useEffect(() => {
    setEditForm(tool);
  }, [tool, isEditing]);

  const handleSave = () => {
    onSaveEdit(editForm);
  };

  const envVars = getCLIEnvVars(tool);
  const hasDocsLink = CLI_DOCS_LINKS[tool.type];

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        tool.enabled
          ? "border-border-default bg-bg-secondary/30"
          : "border-border-default/50 bg-bg-secondary/10 opacity-60"
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-bg-tertiary/50"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={tool.enabled}
              onCheckedChange={(checked) => {
                onToggleEnabled(checked);
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-text-muted" />
              <span className="text-sm font-medium text-text-primary">
                {tool.name}
              </span>
            </div>
            <span className="text-xs text-text-muted">
              {CLI_TYPE_LABELS[tool.type]} • {tool.env_config.api_key_env}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {applyResult && (
            <span
              className={`text-xs ${
                applyResult.success ? "text-accent-green" : "text-accent-red"
              }`}
            >
              {applyResult.success ? "✓" : "✗"}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-text-muted" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border-default p-4 space-y-4">
          {isEditing ? (
            <>
              <CLIToolForm
                tool={editForm}
                onChange={setEditForm}
                showApiKey={showApiKey}
                onToggleApiKey={onToggleApiKey}
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={onCancelEdit}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  {t("common.cancel")}
                </Button>
                <Button variant="default" size="sm" onClick={handleSave}>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  {t("common.save")}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Tool Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-text-muted">{t("settings.cli.apiKey")}:</span>
                  <div className="flex items-center gap-2">
                    <p className="text-text-primary">
                      {showApiKey
                        ? tool.api_key
                        : tool.api_key
                        ? "••••••••••••"
                        : t("common.notSet")}
                    </p>
                    {tool.api_key && (
                      <button
                        onClick={onToggleApiKey}
                        className="text-text-muted hover:text-text-primary"
                      >
                        {showApiKey ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-text-muted">{t("settings.cli.baseUrl")}:</span>
                  <p className="text-text-primary truncate">
                    {tool.base_url || "-"}
                  </p>
                </div>
                {tool.default_model && (
                  <div>
                    <span className="text-text-muted">{t("settings.cli.defaultModel")}:</span>
                    <p className="text-text-primary">{tool.default_model}</p>
                  </div>
                )}
              </div>

              {/* Environment Variables Preview */}
              <div className="bg-bg-tertiary rounded-md p-3">
                <h4 className="text-xs font-medium text-text-muted mb-2">
                  {t("settings.cli.envVarsPreview")}
                </h4>
                <pre className="text-xs text-text-secondary font-mono overflow-x-auto">
                  {Object.entries(envVars).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-accent-blue">export</span>{" "}
                      <span className="text-accent-yellow">{key}</span>=
                      <span className="text-accent-green">"{value.slice(0, 20)}{value.length > 20 ? "..." : ""}"</span>
                    </div>
                  ))}
                </pre>
              </div>

              {/* Apply Result */}
              {applyResult && (
                <div
                  className={`flex items-center gap-2 p-2 rounded text-sm ${
                    applyResult.success
                      ? "bg-accent-green/10 text-accent-green"
                      : "bg-accent-red/10 text-accent-red"
                  }`}
                >
                  <span>{applyResult.message}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-border-default">
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onCopyEnvVars}
                    disabled={!tool.api_key}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    {t("settings.cli.copyEnvVars")}
                  </Button>
                  {hasDocsLink && (
                    <Button variant="secondary" size="sm" onClick={onOpenDocs}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      {t("common.docs")}
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={onEdit}>
                    <Edit2 className="h-3.5 w-3.5 mr-1" />
                    {t("common.edit")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onDelete}
                    className="text-accent-red hover:bg-accent-red/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    {t("common.delete")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
