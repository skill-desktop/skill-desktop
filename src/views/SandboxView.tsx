import React from "react";
import { useTranslation } from "react-i18next";
import { Play, RotateCcw, AlertTriangle, CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight, Clock, FileCode2, Terminal } from "lucide-react";
import { Button, Input, ScrollArea, Badge } from "@/components/ui";
import { useSkills, useSkillScripts, useExecuteScript } from "@/hooks";
import type { Skill, Parameter } from "@/types";
import { getPermissionLevel } from "@/types";
import type { ExecutionResult } from "@/hooks";

interface HistoryEntry {
  skillName: string;
  scriptPath?: string;
  params: Record<string, string>;
  result: ExecutionResult;
  timestamp: string;
}

export const SandboxView: React.FC = () => {
  const { t } = useTranslation();
  const { data: skills = [] } = useSkills();

  const [selectedSkill, setSelectedSkill] = React.useState<Skill | null>(null);
  const [selectedScript, setSelectedScript] = React.useState<string | null>(null);
  const [paramValues, setParamValues] = React.useState<Record<string, string>>({});
  const [executionResult, setExecutionResult] = React.useState<ExecutionResult | null>(null);
  const [executionHistory, setExecutionHistory] = React.useState<HistoryEntry[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = React.useState(false);
  const [expandedHistory, setExpandedHistory] = React.useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = React.useState<"params" | "scripts">("params");

  // Fetch available scripts for the selected skill
  const { data: scripts = [] } = useSkillScripts(selectedSkill?.hash || null);

  // Execute script mutation
  const executeScriptMutation = useExecuteScript();

  // Reset params when skill changes
  React.useEffect(() => {
    if (selectedSkill) {
      const initialValues: Record<string, string> = {};
      selectedSkill.parameters.forEach((param) => {
        initialValues[param.name] = param.default?.toString() || "";
      });
      setParamValues(initialValues);
      setExecutionResult(null);
      setSelectedScript(null);
    }
  }, [selectedSkill]);

  // Check if skill has high-risk permissions
  const hasHighRiskPermissions = React.useMemo(() => {
    if (!selectedSkill) return false;
    return selectedSkill.permissions.some((p) => getPermissionLevel(p) === "high");
  }, [selectedSkill]);

  // Handle parameter change
  const handleParamChange = (name: string, value: string) => {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  };

  // Reset parameters
  const handleReset = () => {
    if (selectedSkill) {
      const initialValues: Record<string, string> = {};
      selectedSkill.parameters.forEach((param) => {
        initialValues[param.name] = param.default?.toString() || "";
      });
      setParamValues(initialValues);
    }
    setExecutionResult(null);
    setSelectedScript(null);
  };

  // Execute skill script
  const handleExecute = async () => {
    if (!selectedSkill) return;

    // Check for high-risk permissions
    if (hasHighRiskPermissions && !showConfirmDialog) {
      setShowConfirmDialog(true);
      return;
    }

    setShowConfirmDialog(false);
    setExecutionResult(null);

    // If we have a script selected, execute it
    if (selectedScript) {
      try {
        // Convert params to args format
        const args = Object.entries(paramValues)
          .filter(([_, v]) => v.trim())
          .map(([k, v]) => `--${k}=${v}`);

        const result = await executeScriptMutation.mutateAsync({
          skillHash: selectedSkill.hash,
          scriptPath: selectedScript,
          args,
          envVars: {},
        });

        setExecutionResult(result);
        setExecutionHistory((prev) => [{
          skillName: selectedSkill.name,
          scriptPath: selectedScript,
          params: { ...paramValues },
          result,
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 20));
      } catch (error) {
        const errorResult: ExecutionResult = {
          success: false,
          stdout: "",
          stderr: String(error),
          exitCode: null,
          durationMs: 0,
        };
        setExecutionResult(errorResult);
      }
    } else {
      // Mock execution for skills without scripts
      const mockResult: ExecutionResult = {
        success: true,
        stdout: generateMockOutput(selectedSkill, paramValues),
        stderr: "",
        exitCode: 0,
        durationMs: Math.floor(Math.random() * 500) + 100,
      };

      setExecutionResult(mockResult);
      setExecutionHistory((prev) => [{
        skillName: selectedSkill.name,
        params: { ...paramValues },
        result: mockResult,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 20));
    }
  };

  // Toggle history item expansion
  const toggleHistoryExpansion = (index: number) => {
    setExpandedHistory((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // Validate required parameters
  const isValid = React.useMemo(() => {
    if (!selectedSkill) return false;
    return selectedSkill.parameters
      .filter((p) => p.required)
      .every((p) => paramValues[p.name]?.trim());
  }, [selectedSkill, paramValues]);

  const isExecuting = executeScriptMutation.isPending;

  return (
    <div className="flex h-full">
      {/* Skill selector */}
      <div className="w-72 border-r border-border-default bg-bg-secondary">
        <div className="border-b border-border-default p-3">
          <h2 className="text-sm font-medium text-text-primary">{t("sandbox.selectSkill")}</h2>
        </div>
        <ScrollArea className="h-[calc(100%-49px)]">
          {skills.length === 0 ? (
            <div className="p-4 text-center text-sm text-text-muted">
              {t("sandbox.noSkills")}
            </div>
          ) : (
            skills.map((skill) => (
              <button
                key={skill.hash}
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  selectedSkill?.hash === skill.hash
                    ? "bg-bg-tertiary text-text-primary border-l-2 border-accent-blue"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary border-l-2 border-transparent"
                }`}
                onClick={() => setSelectedSkill(skill)}
              >
                <div className="flex items-center gap-2">
                  <div className="font-medium truncate flex-1">{skill.name}</div>
                  {skill.resources.scripts.length > 0 && (
                    <FileCode2 className="h-3.5 w-3.5 text-accent-blue shrink-0" />
                  )}
                </div>
                <div className="text-xs text-text-muted truncate">
                  {skill.parameters.length} {t("sandbox.parameters")}
                  {skill.resources.scripts.length > 0 && (
                    <span className="ml-2">• {skill.resources.scripts.length} scripts</span>
                  )}
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {selectedSkill ? (
          <>
            {/* Header */}
            <div className="border-b border-border-default p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">{selectedSkill.name}</h2>
                  <p className="text-sm text-text-muted">{selectedSkill.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedSkill.permissions.map((permission) => (
                    <Badge key={permission} variant={getPermissionLevel(permission)}>
                      {permission}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabs for parameters and scripts */}
            <div className="flex-1 overflow-auto p-4">
              <div className="max-w-2xl">
                {/* Tab buttons */}
                <div className="flex gap-1 mb-4 border-b border-border-default pb-1">
                  <button
                    onClick={() => setActiveTab("params")}
                    className={`px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors ${
                      activeTab === "params"
                        ? "bg-bg-tertiary text-text-primary"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {t("sandbox.parameterInput")}
                  </button>
                  {scripts.length > 0 && (
                    <button
                      onClick={() => setActiveTab("scripts")}
                      className={`px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors flex items-center gap-1.5 ${
                        activeTab === "scripts"
                          ? "bg-bg-tertiary text-text-primary"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      <FileCode2 className="h-3.5 w-3.5" />
                      Scripts ({scripts.length})
                    </button>
                  )}
                </div>

                {/* Tab content: Parameters */}
                {activeTab === "params" && (
                  <>
                    {selectedSkill.parameters.length === 0 ? (
                      <p className="text-sm text-text-muted">{t("sandbox.noParameters")}</p>
                    ) : (
                      <div className="space-y-4">
                        {selectedSkill.parameters.map((param) => (
                          <ParameterInput
                            key={param.name}
                            param={param}
                            value={paramValues[param.name] || ""}
                            onChange={(value) => handleParamChange(param.name, value)}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Tab content: Scripts */}
                {activeTab === "scripts" && (
                  <>
                    <div className="space-y-2">
                      {scripts.map((script) => (
                        <button
                          key={script}
                          onClick={() => setSelectedScript(script === selectedScript ? null : script)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md border transition-colors ${
                            selectedScript === script
                              ? "border-accent-blue bg-accent-blue/10"
                              : "border-border-default hover:bg-bg-tertiary"
                          }`}
                        >
                          <Terminal className="h-4 w-4 text-text-muted" />
                          <span className="text-sm font-mono text-text-primary">{script}</span>
                        </button>
                      ))}
                    </div>
                    {selectedScript && (
                      <p className="text-xs text-text-muted mt-3">
                        Selected script: <code className="bg-bg-tertiary px-1 rounded">{selectedScript}</code>
                      </p>
                    )}
                  </>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-6">
                  <Button
                    onClick={handleExecute}
                    disabled={!isValid || isExecuting}
                  >
                    {isExecuting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    {selectedScript ? `Execute ${selectedScript}` : t("sandbox.execute")}
                  </Button>
                  <Button variant="secondary" onClick={handleReset}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {t("sandbox.reset")}
                  </Button>
                </div>

                {/* High-risk warning dialog */}
                {showConfirmDialog && (
                  <div className="mt-4 p-4 rounded-lg border border-accent-yellow bg-accent-yellow/10">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-accent-yellow shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-text-primary">{t("sandbox.highRiskWarning")}</h4>
                        <p className="text-sm text-text-secondary mt-1">{t("sandbox.highRiskDescription")}</p>
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" onClick={handleExecute}>
                            {t("sandbox.confirmExecute")}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setShowConfirmDialog(false)}>
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Execution result */}
                {executionResult && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                      {t("sandbox.executionResult")}
                      <span className="text-xs text-text-muted">
                        {executionResult.durationMs}ms
                      </span>
                      {executionResult.exitCode !== null && (
                        <span className="text-xs text-text-muted">
                          (exit code: {executionResult.exitCode})
                        </span>
                      )}
                    </h3>
                    <div
                      className={`rounded-lg border p-4 ${
                        executionResult.success
                          ? "border-accent-green/30 bg-accent-green/5"
                          : "border-accent-red/30 bg-accent-red/5"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {executionResult.success ? (
                          <CheckCircle className="h-4 w-4 text-accent-green" />
                        ) : (
                          <XCircle className="h-4 w-4 text-accent-red" />
                        )}
                        <span className="text-sm font-medium">
                          {executionResult.success ? t("sandbox.success") : t("sandbox.failed")}
                        </span>
                      </div>
                      {executionResult.stdout && (
                        <div className="mb-2">
                          <div className="text-xs text-text-muted mb-1">stdout:</div>
                          <pre className="text-xs font-mono bg-bg-primary p-3 rounded overflow-x-auto whitespace-pre-wrap">
                            {executionResult.stdout}
                          </pre>
                        </div>
                      )}
                      {executionResult.stderr && (
                        <div>
                          <div className="text-xs text-text-muted mb-1">stderr:</div>
                          <pre className="text-xs font-mono bg-bg-primary p-3 rounded overflow-x-auto whitespace-pre-wrap text-accent-red">
                            {executionResult.stderr}
                          </pre>
                        </div>
                      )}
                      {!executionResult.stdout && !executionResult.stderr && (
                        <pre className="text-xs font-mono bg-bg-primary p-3 rounded text-text-muted">
                          (no output)
                        </pre>
                      )}
                    </div>
                  </div>
                )}

                {/* Execution history */}
                {executionHistory.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-text-primary mb-2">{t("sandbox.history")}</h3>
                    <div className="space-y-2">
                      {executionHistory.map((entry, index) => (
                        <div
                          key={index}
                          className="border border-border-default rounded-lg overflow-hidden"
                        >
                          <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-tertiary"
                            onClick={() => toggleHistoryExpansion(index)}
                          >
                            {expandedHistory.has(index) ? (
                              <ChevronDown className="h-4 w-4 text-text-muted" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-text-muted" />
                            )}
                            {entry.result.success ? (
                              <CheckCircle className="h-4 w-4 text-accent-green" />
                            ) : (
                              <XCircle className="h-4 w-4 text-accent-red" />
                            )}
                            <span className="text-sm text-text-primary flex-1">
                              {entry.skillName}
                              {entry.scriptPath && (
                                <span className="text-text-muted ml-1">/ {entry.scriptPath}</span>
                              )}
                            </span>
                            <span className="text-xs text-text-muted flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {entry.result.durationMs}ms
                            </span>
                          </button>
                          {expandedHistory.has(index) && (
                            <div className="px-3 pb-3">
                              <div className="text-xs text-text-muted mb-1">
                                {new Date(entry.timestamp).toLocaleString()}
                              </div>
                              {entry.result.stdout && (
                                <pre className="text-xs font-mono bg-bg-primary p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                  {entry.result.stdout}
                                </pre>
                              )}
                              {entry.result.stderr && (
                                <pre className="text-xs font-mono bg-bg-primary p-2 rounded overflow-x-auto whitespace-pre-wrap text-accent-red mt-1">
                                  {entry.result.stderr}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted">
            <p>{t("sandbox.selectSkillPrompt")}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Parameter input component
interface ParameterInputProps {
  param: Parameter;
  value: string;
  onChange: (value: string) => void;
}

const ParameterInput: React.FC<ParameterInputProps> = ({ param, value, onChange }) => {
  const { t } = useTranslation();

  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1">
        {param.name}
        {param.required && <span className="text-accent-red ml-1">*</span>}
        <span className="text-xs text-text-muted ml-2">({param.type})</span>
      </label>
      {param.description && (
        <p className="text-xs text-text-muted mb-2">{param.description}</p>
      )}
      {param.type === "boolean" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 rounded-md border border-border-default bg-bg-secondary px-3 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
        >
          <option value="">{t("sandbox.selectValue")}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : param.type === "object" || param.type === "array" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${t("sandbox.enterJson")} ${param.type}`}
          className="w-full min-h-[80px] rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm text-text-primary font-mono focus:border-accent-blue focus:outline-none"
        />
      ) : (
        <Input
          type={param.type === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.default?.toString() || `${t("sandbox.enter")} ${param.name}`}
        />
      )}
    </div>
  );
};

// Generate mock output based on skill and parameters (fallback for skills without scripts)
function generateMockOutput(skill: Skill, params: Record<string, string>): string {
  const output = {
    skill: skill.name,
    version: skill.version,
    parameters: params,
    result: {
      status: "success",
      message: `Skill "${skill.name}" simulated successfully with ${Object.keys(params).length} parameters.`,
      note: "This is a mock execution. Add scripts to the skill's scripts/ directory to enable real execution.",
      data: {
        timestamp: new Date().toISOString(),
        executionId: Math.random().toString(36).substring(7),
      },
    },
  };

  return JSON.stringify(output, null, 2);
}
