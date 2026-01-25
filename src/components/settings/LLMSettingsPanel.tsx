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
  Star,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Input, Switch } from "@/components/ui";
import { useSettingsStore } from "@/stores";
import {
  type LLMProviderConfig,
  type LLMProviderType,
  PROVIDER_PRESETS,
  createProviderConfig,
} from "@/types/llm";

// Backend types for LLM test
interface LLMTestRequest {
  provider_type: "openai_compatible" | "anthropic" | "openai_responses";
  base_url: string;
  api_key: string;
  model: string;
}

interface LLMTestResult {
  success: boolean;
  message: string;
}

// Provider type labels
const PROVIDER_TYPE_LABELS: Record<LLMProviderType, string> = {
  openai_compatible: "OpenAI Compatible",
  anthropic: "Anthropic",
  openai_responses: "OpenAI Responses API",
};

export const LLMSettingsPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    llmSettings,
    addLLMProvider,
    updateLLMProvider,
    removeLLMProvider,
    setDefaultLLMProvider,
  } = useSettingsStore();

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string }>>({});

  // New provider form state
  const [newProvider, setNewProvider] = useState<LLMProviderConfig>(() =>
    createProviderConfig()
  );

  const handleAddFromPreset = (presetKey: string) => {
    const config = createProviderConfig(presetKey as keyof typeof PROVIDER_PRESETS);
    setNewProvider(config);
    setIsAddingNew(true);
  };

  const handleAddCustom = () => {
    setNewProvider(createProviderConfig());
    setIsAddingNew(true);
  };

  const handleSaveNew = () => {
    if (!newProvider.name || !newProvider.base_url) {
      return;
    }
    addLLMProvider(newProvider);
    setIsAddingNew(false);
    setNewProvider(createProviderConfig());
  };

  const handleCancelNew = () => {
    setIsAddingNew(false);
    setNewProvider(createProviderConfig());
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t("settings.llm.confirmDelete"))) {
      removeLLMProvider(id);
    }
  };

  const handleSetDefault = (id: string) => {
    setDefaultLLMProvider(id);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const toggleShowApiKey = (id: string) => {
    setShowApiKey((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleTestConnection = async (provider: LLMProviderConfig) => {
    setTestingId(provider.id);
    setTestResult((prev) => ({ ...prev, [provider.id]: { success: false, message: "" } }));

    try {
      // Use backend command to test connection (avoids CORS issues)
      const request: LLMTestRequest = {
        provider_type: provider.type,
        base_url: provider.base_url,
        api_key: provider.api_key,
        model: provider.default_model,
      };

      const result = await invoke<LLMTestResult>("test_llm_connection", { request });
      
      setTestResult((prev) => ({
        ...prev,
        [provider.id]: {
          success: result.success,
          message: result.success ? t("settings.llm.testSuccess") : result.message,
        },
      }));
    } catch (error) {
      setTestResult((prev) => ({
        ...prev,
        [provider.id]: {
          success: false,
          message: error instanceof Error ? error.message : "Connection failed",
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">
          {t("settings.llm.title")}
        </h2>
        <p className="text-sm text-text-muted">
          {t("settings.llm.description")}
        </p>
      </div>

      {/* Quick Add Presets */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">
          {t("settings.llm.quickAdd")}
        </h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
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
            {t("settings.llm.custom")}
          </Button>
        </div>
      </div>

      {/* Add New Provider Form */}
      {isAddingNew && (
        <div className="border border-border-default rounded-lg p-4 bg-bg-secondary/50 space-y-4">
          <h3 className="text-sm font-medium text-text-primary">
            {t("settings.llm.addProvider")}
          </h3>
          
          <ProviderForm
            provider={newProvider}
            onChange={setNewProvider}
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
              disabled={!newProvider.name || !newProvider.base_url}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {t("common.save")}
            </Button>
          </div>
        </div>
      )}

      {/* Provider List */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">
          {t("settings.llm.configuredProviders")}
          {llmSettings.providers.length > 0 && (
            <span className="text-text-muted ml-2">
              ({llmSettings.providers.length})
            </span>
          )}
        </h3>

        {llmSettings.providers.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <p>{t("settings.llm.noProviders")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {llmSettings.providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isDefault={provider.id === llmSettings.default_provider_id}
                isExpanded={expandedId === provider.id}
                isEditing={editingId === provider.id}
                isTesting={testingId === provider.id}
                testResult={testResult[provider.id]}
                showApiKey={showApiKey[provider.id] || false}
                onToggleExpand={() => toggleExpand(provider.id)}
                onToggleApiKey={() => toggleShowApiKey(provider.id)}
                onEdit={() => setEditingId(provider.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={(updates) => {
                  updateLLMProvider(provider.id, updates);
                  setEditingId(null);
                }}
                onDelete={() => handleDelete(provider.id)}
                onSetDefault={() => handleSetDefault(provider.id)}
                onToggleEnabled={(enabled) =>
                  updateLLMProvider(provider.id, { enabled })
                }
                onTestConnection={() => handleTestConnection(provider)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Provider Form Component
interface ProviderFormProps {
  provider: LLMProviderConfig;
  onChange: (provider: LLMProviderConfig) => void;
  showApiKey: boolean;
  onToggleApiKey: () => void;
}

const ProviderForm: React.FC<ProviderFormProps> = ({
  provider,
  onChange,
  showApiKey,
  onToggleApiKey,
}) => {
  const { t } = useTranslation();

  const handleChange = (field: keyof LLMProviderConfig, value: unknown) => {
    onChange({ ...provider, [field]: value });
  };

  const handleModelsChange = (value: string) => {
    const models = value.split(",").map((m) => m.trim()).filter(Boolean);
    onChange({ ...provider, available_models: models });
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 sm:col-span-1">
        <label className="block text-xs text-text-muted mb-1">
          {t("settings.llm.providerName")}
        </label>
        <Input
          value={provider.name}
          onChange={(e) => handleChange("name", e.target.value)}
          placeholder="My Provider"
        />
      </div>

      <div className="col-span-2 sm:col-span-1">
        <label className="block text-xs text-text-muted mb-1">
          {t("settings.llm.providerType")}
        </label>
        <select
          value={provider.type}
          onChange={(e) => handleChange("type", e.target.value as LLMProviderType)}
          className="w-full h-9 rounded-md border border-border-default bg-bg-secondary px-3 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
        >
          {Object.entries(PROVIDER_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-2">
        <label className="block text-xs text-text-muted mb-1">
          {t("settings.llm.baseUrl")}
        </label>
        <Input
          value={provider.base_url}
          onChange={(e) => handleChange("base_url", e.target.value)}
          placeholder="https://api.example.com/v1"
        />
      </div>

      <div className="col-span-2">
        <label className="block text-xs text-text-muted mb-1">
          {t("settings.llm.apiKey")}
        </label>
        <div className="relative">
          <Input
            type={showApiKey ? "text" : "password"}
            value={provider.api_key}
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
          {t("settings.llm.defaultModel")}
        </label>
        <Input
          value={provider.default_model}
          onChange={(e) => handleChange("default_model", e.target.value)}
          placeholder="gpt-4o"
        />
      </div>

      <div className="col-span-2 sm:col-span-1">
        <label className="block text-xs text-text-muted mb-1">
          {t("settings.llm.availableModels")}
        </label>
        <Input
          value={provider.available_models.join(", ")}
          onChange={(e) => handleModelsChange(e.target.value)}
          placeholder="gpt-4o, gpt-4o-mini"
        />
      </div>
    </div>
  );
};

// Provider Card Component
interface ProviderCardProps {
  provider: LLMProviderConfig;
  isDefault: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  isTesting: boolean;
  testResult?: { success: boolean; message: string };
  showApiKey: boolean;
  onToggleExpand: () => void;
  onToggleApiKey: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (updates: Partial<LLMProviderConfig>) => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onTestConnection: () => void;
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  isDefault,
  isExpanded,
  isEditing,
  isTesting,
  testResult,
  showApiKey,
  onToggleExpand,
  onToggleApiKey,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onSetDefault,
  onToggleEnabled,
  onTestConnection,
}) => {
  const { t } = useTranslation();
  const [editForm, setEditForm] = useState<LLMProviderConfig>(provider);

  React.useEffect(() => {
    setEditForm(provider);
  }, [provider, isEditing]);

  const handleSave = () => {
    onSaveEdit(editForm);
  };

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        provider.enabled
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
                checked={provider.enabled}
                onCheckedChange={(checked) => {
                  onToggleEnabled(checked);
                }}
              />
            </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary">
                {provider.name}
              </span>
              {isDefault && (
                <span className="flex items-center gap-1 text-xs text-accent-yellow">
                  <Star className="h-3 w-3 fill-current" />
                  {t("settings.llm.default")}
                </span>
              )}
            </div>
            <span className="text-xs text-text-muted">
              {PROVIDER_TYPE_LABELS[provider.type]} • {provider.default_model}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {testResult && (
            <span
              className={`text-xs ${
                testResult.success ? "text-accent-green" : "text-accent-red"
              }`}
            >
              {testResult.success ? "✓" : "✗"}
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
              <ProviderForm
                provider={editForm}
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
              {/* Provider Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-text-muted">{t("settings.llm.baseUrl")}:</span>
                  <p className="text-text-primary truncate">{provider.base_url}</p>
                </div>
                <div>
                  <span className="text-text-muted">{t("settings.llm.apiKey")}:</span>
                  <div className="flex items-center gap-2">
                    <p className="text-text-primary">
                      {showApiKey
                        ? provider.api_key
                        : provider.api_key
                        ? "••••••••••••"
                        : t("common.notSet")}
                    </p>
                    {provider.api_key && (
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
                <div className="col-span-2">
                  <span className="text-text-muted">{t("settings.llm.availableModels")}:</span>
                  <p className="text-text-primary">
                    {provider.available_models.join(", ") || "-"}
                  </p>
                </div>
              </div>

              {/* Test Result */}
              {testResult && (
                <div
                  className={`flex items-center gap-2 p-2 rounded text-sm ${
                    testResult.success
                      ? "bg-accent-green/10 text-accent-green"
                      : "bg-accent-red/10 text-accent-red"
                  }`}
                >
                  <AlertCircle className="h-4 w-4" />
                  <span>{testResult.message}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-border-default">
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onTestConnection}
                    disabled={isTesting || !provider.api_key}
                  >
                    {isTesting ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5 mr-1" />
                    )}
                    {t("settings.llm.testConnection")}
                  </Button>
                  {!isDefault && (
                    <Button variant="secondary" size="sm" onClick={onSetDefault}>
                      <Star className="h-3.5 w-3.5 mr-1" />
                      {t("settings.llm.setAsDefault")}
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
