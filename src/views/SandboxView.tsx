import React from "react";
import { useTranslation } from "react-i18next";
import { Play, RotateCcw, AlertTriangle, CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight, Clock, FileCode2, Terminal } from "lucide-react";
import {
  Button,
  Input,
  Badge,
  SidePanel,
  SideNavItem,
  EmptyState,
  Textarea,
  Alert,
  Section,
  ButtonGroup,
} from "@/components/ui";
import { cn } from "@/lib/utils";
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
      <SidePanel title={t("sandbox.selectSkill")}>
        {skills.length === 0 ? (
          <EmptyState
            variant="compact"
            title={t("sandbox.noSkills")}
          />
        ) : (
          skills.map((skill) => (
            <SideNavItem
              key={skill.hash}
              label={skill.name}
              meta={
                <>
                  {skill.parameters.length} {t("sandbox.parameters")}
                  {skill.resources.scripts.length > 0 && (
                    <span className="ml-2">• {skill.resources.scripts.length} scripts</span>
                  )}
                </>
              }
              trailing={
                skill.resources.scripts.length > 0 ? (
                  <FileCode2 className="h-3.5 w-3.5 text-accent-blue" />
                ) : null
              }
              active={selectedSkill?.hash === skill.hash}
              onClick={() => setSelectedSkill(skill)}
            />
          ))
        )}
      </SidePanel>

      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedSkill ? (
          <>
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border-default px-6 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-text-primary">
                  {selectedSkill.name}
                </h2>
                {selectedSkill.description && (
                  <p className="mt-1 text-sm text-text-muted">{selectedSkill.description}</p>
                )}
              </div>
              {selectedSkill.permissions.length > 0 && (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {selectedSkill.permissions.map((permission) => (
                    <Badge key={permission} variant={getPermissionLevel(permission)}>
                      {permission}
                    </Badge>
                  ))}
                </div>
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="mx-auto max-w-2xl space-y-6">
                <ButtonGroup>
                  <Button
                    variant={activeTab === "params" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setActiveTab("params")}
                  >
                    {t("sandbox.parameterInput")}
                    {selectedSkill.parameters.length > 0 && (
                      <span className="ml-1.5 text-text-muted tabular-nums">
                        {selectedSkill.parameters.length}
                      </span>
                    )}
                  </Button>
                  {scripts.length > 0 && (
                    <Button
                      variant={activeTab === "scripts" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setActiveTab("scripts")}
                    >
                      <FileCode2 className="mr-1 h-3.5 w-3.5" />
                      Scripts
                      <span className="ml-1.5 text-text-muted tabular-nums">{scripts.length}</span>
                    </Button>
                  )}
                </ButtonGroup>

                {activeTab === "params" &&
                  (selectedSkill.parameters.length === 0 ? (
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
                  ))}

                {activeTab === "scripts" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {scripts.map((script) => (
                        <button
                          key={script}
                          onClick={() =>
                            setSelectedScript(script === selectedScript ? null : script)
                          }
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md border px-3 py-2 transition-colors",
                            selectedScript === script
                              ? "border-accent-blue bg-accent-blue/10"
                              : "border-border-default hover:bg-bg-tertiary"
                          )}
                        >
                          <Terminal className="h-4 w-4 text-text-muted" />
                          <span className="truncate font-mono text-sm text-text-primary">
                            {script}
                          </span>
                        </button>
                      ))}
                    </div>
                    {selectedScript && (
                      <p className="text-xs text-text-muted">
                        Selected script:{" "}
                        <code className="rounded bg-bg-tertiary px-1 font-mono">
                          {selectedScript}
                        </code>
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button onClick={handleExecute} disabled={!isValid || isExecuting}>
                    {isExecuting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    {selectedScript ? `Execute ${selectedScript}` : t("sandbox.execute")}
                  </Button>
                  <Button variant="secondary" onClick={handleReset}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t("sandbox.reset")}
                  </Button>
                </div>

                {showConfirmDialog && (
                  <Alert
                    tone="warning"
                    icon={<AlertTriangle className="h-3.5 w-3.5" />}
                    className="text-sm"
                  >
                    <div className="space-y-2 text-text-primary">
                      <p className="font-medium">{t("sandbox.highRiskWarning")}</p>
                      <p className="text-text-secondary">{t("sandbox.highRiskDescription")}</p>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={handleExecute}>
                          {t("sandbox.confirmExecute")}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setShowConfirmDialog(false)}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  </Alert>
                )}

                {executionResult && (
                  <Section
                    title={
                      <span className="flex items-center gap-2">
                        {t("sandbox.executionResult")}
                        <span className="text-xs font-normal text-text-muted tabular-nums">
                          {executionResult.durationMs}ms
                        </span>
                        {executionResult.exitCode !== null && (
                          <span className="text-xs font-normal text-text-muted">
                            (exit {executionResult.exitCode})
                          </span>
                        )}
                      </span>
                    }
                  >
                    <div
                      className={cn(
                        "rounded-lg border p-4",
                        executionResult.success
                          ? "border-accent-green/30 bg-accent-green/5"
                          : "border-accent-red/30 bg-accent-red/5"
                      )}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        {executionResult.success ? (
                          <CheckCircle className="h-4 w-4 text-accent-green" />
                        ) : (
                          <XCircle className="h-4 w-4 text-accent-red" />
                        )}
                        <span className="text-sm font-medium">
                          {executionResult.success
                            ? t("sandbox.success")
                            : t("sandbox.failed")}
                        </span>
                      </div>
                      {executionResult.stdout && (
                        <OutputBlock label="stdout" content={executionResult.stdout} />
                      )}
                      {executionResult.stderr && (
                        <OutputBlock
                          label="stderr"
                          content={executionResult.stderr}
                          tone="error"
                        />
                      )}
                      {!executionResult.stdout && !executionResult.stderr && (
                        <pre className="rounded bg-bg-primary p-3 font-mono text-xs text-text-muted">
                          (no output)
                        </pre>
                      )}
                    </div>
                  </Section>
                )}

                {executionHistory.length > 0 && (
                  <Section title={t("sandbox.history")}>
                    <div className="space-y-2">
                      {executionHistory.map((entry, index) => (
                        <div
                          key={index}
                          className="overflow-hidden rounded-lg border border-border-default"
                        >
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-tertiary"
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
                            <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                              {entry.skillName}
                              {entry.scriptPath && (
                                <span className="ml-1 text-text-muted">/ {entry.scriptPath}</span>
                              )}
                            </span>
                            <span className="flex shrink-0 items-center gap-1 text-xs text-text-muted tabular-nums">
                              <Clock className="h-3 w-3" />
                              {entry.result.durationMs}ms
                            </span>
                          </button>
                          {expandedHistory.has(index) && (
                            <div className="space-y-2 border-t border-border-muted px-3 pb-3 pt-2">
                              <div className="text-xs text-text-muted">
                                {new Date(entry.timestamp).toLocaleString()}
                              </div>
                              {entry.result.stdout && (
                                <OutputBlock label="stdout" content={entry.result.stdout} />
                              )}
                              {entry.result.stderr && (
                                <OutputBlock
                                  label="stderr"
                                  content={entry.result.stderr}
                                  tone="error"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            className="flex-1"
            variant="compact"
            title={t("sandbox.selectSkillPrompt")}
          />
        )}
      </div>
    </div>
  );
};

interface OutputBlockProps {
  label: string;
  content: string;
  tone?: "default" | "error";
}

const OutputBlock: React.FC<OutputBlockProps> = ({ label, content, tone = "default" }) => (
  <div className="space-y-1">
    <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
    <pre
      className={cn(
        "overflow-x-auto whitespace-pre-wrap rounded bg-bg-primary p-3 font-mono text-xs",
        tone === "error" ? "text-accent-red" : "text-text-primary"
      )}
    >
      {content}
    </pre>
  </div>
);

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
        <Textarea
          mono
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${t("sandbox.enterJson")} ${param.type}`}
          className="min-h-[80px]"
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
