import React from "react";
import { useTranslation } from "react-i18next";
import {
  Play,
  Loader2,
  RotateCcw,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Button,
  Input,
  Textarea,
  Alert,
  toast,
} from "@/components/ui";
import { useSkillScripts, useExecuteScript, type ExecutionResult } from "@/hooks";
import { useAppStore } from "@/stores";
import { getPermissionLevel } from "@/types";
import type { Skill, Parameter } from "@/types";

interface RunTabProps {
  skill: Skill;
}

/**
 * The Run tab lives inside the SkillDetail panel. It's a compact, opinionated
 * runner for the common case ("just run this script and show me what
 * happened") — for power-user features like history, complex env vars or
 * permission profiles, the user can still click "Open in full sandbox view"
 * at the top right to switch to SandboxView.
 *
 * The panel itself is only ~400px wide so the layout is deliberately stacked
 * vertically; we don't try to recreate SandboxView's three-pane layout here.
 */
export const RunTab: React.FC<RunTabProps> = ({ skill }) => {
  const { t } = useTranslation();
  const { setCurrentView, setPendingSandboxSkillHash } = useAppStore();

  const { data: scripts = [], isLoading: scriptsLoading } = useSkillScripts(
    skill.hash
  );
  const execMutation = useExecuteScript();

  const [selectedScript, setSelectedScript] = React.useState<string | null>(
    null
  );
  const [paramValues, setParamValues] = React.useState<Record<string, string>>(
    {}
  );
  const [result, setResult] = React.useState<ExecutionResult | null>(null);
  const [showConfirm, setShowConfirm] = React.useState(false);

  // Pre-select the first script when scripts arrive.
  React.useEffect(() => {
    if (scripts.length > 0 && !selectedScript) {
      setSelectedScript(scripts[0]);
    }
  }, [scripts, selectedScript]);

  // Reset parameter state when the skill changes (defensive — RunTab is
  // remounted on skill switch, but we still seed default values here).
  React.useEffect(() => {
    const initial: Record<string, string> = {};
    skill.parameters.forEach((p) => {
      initial[p.name] = p.default?.toString() ?? "";
    });
    setParamValues(initial);
    setResult(null);
    setShowConfirm(false);
  }, [skill.hash]);

  const hasHighRisk = React.useMemo(
    () => skill.permissions.some((p) => getPermissionLevel(p) === "high"),
    [skill.permissions]
  );

  const requiredMissing = skill.parameters
    .filter((p) => p.required)
    .some((p) => !paramValues[p.name]?.trim());

  const canRun = !!selectedScript && !requiredMissing && !execMutation.isPending;

  const handleParamChange = (name: string, value: string) => {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleReset = () => {
    const initial: Record<string, string> = {};
    skill.parameters.forEach((p) => {
      initial[p.name] = p.default?.toString() ?? "";
    });
    setParamValues(initial);
    setResult(null);
  };

  const performExecute = async () => {
    if (!selectedScript) return;
    setShowConfirm(false);
    setResult(null);

    try {
      const args = Object.entries(paramValues)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => `--${k}=${v}`);

      const res = await execMutation.mutateAsync({
        skillHash: skill.hash,
        scriptPath: selectedScript,
        args,
        envVars: {},
      });
      setResult(res);
      if (res.success) {
        toast.success(
          t("skillDetail.run.execute") + " · " + skill.name,
          `${selectedScript} · ${res.durationMs}ms`
        );
      } else {
        toast.error(
          t("skillDetail.run.execute") + " · " + skill.name,
          res.stderr || `exit ${res.exitCode}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({
        success: false,
        stdout: "",
        stderr: msg,
        exitCode: null,
        durationMs: 0,
      });
      toast.error(t("skillDetail.run.execute") + " · " + skill.name, msg);
    }
  };

  const handleExecute = () => {
    if (hasHighRisk && !showConfirm) {
      setShowConfirm(true);
      return;
    }
    void performExecute();
  };

  const handleOpenFullView = () => {
    setPendingSandboxSkillHash(skill.hash);
    setCurrentView("sandbox");
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

  if (scriptsLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (scripts.length === 0) {
    return (
      <div className="space-y-3 py-6">
        <Alert tone="info" icon={<Terminal className="h-3.5 w-3.5" />}>
          {t("skillDetail.run.noScripts")}
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Script selector — radio-style buttons rather than a dropdown so the
          user immediately sees what scripts exist. */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("skillDetail.run.selectScript")}
          </h3>
          <button
            type="button"
            onClick={handleOpenFullView}
            className="flex items-center gap-1 text-[11px] text-text-muted transition-colors hover:text-accent-blue"
            title={t("skillDetail.run.openFullView")}
          >
            <ExternalLink className="h-3 w-3" />
            {t("skillDetail.run.openFullView")}
          </button>
        </div>
        <div className="space-y-1.5">
          {scripts.map((script) => (
            <button
              key={script}
              type="button"
              onClick={() =>
                setSelectedScript((cur) => (cur === script ? null : script))
              }
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                selectedScript === script
                  ? "border-accent-blue bg-accent-blue/10"
                  : "border-border-default hover:bg-bg-tertiary"
              )}
            >
              <Terminal className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <span className="truncate font-mono text-xs text-text-primary">
                {script}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Parameters */}
      {skill.parameters.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("skillDetail.parameters")}
          </h3>
          {skill.parameters.map((param) => (
            <RunParamInput
              key={param.name}
              param={param}
              value={paramValues[param.name] ?? ""}
              onChange={(v) => handleParamChange(param.name, v)}
            />
          ))}
        </section>
      ) : (
        <p className="text-xs text-text-muted">{t("skillDetail.run.noParams")}</p>
      )}

      {/* High-risk confirm */}
      {showConfirm && (
        <Alert
          tone="warning"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          className="text-xs"
        >
          <div className="space-y-2">
            <p className="font-medium text-text-primary">
              {t("skillDetail.run.highRiskWarning")}
            </p>
            <p className="text-text-secondary">
              {t("skillDetail.run.highRiskHelp")}
            </p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => void performExecute()}>
                {t("skillDetail.run.confirmRun")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowConfirm(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {/* Action row */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1"
          onClick={handleExecute}
          disabled={!canRun}
        >
          {execMutation.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          {execMutation.isPending
            ? t("skillDetail.run.running")
            : t("skillDetail.run.execute")}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleReset}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Result */}
      {result && <ResultBlock result={result} />}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────────────

interface ResultBlockProps {
  result: ExecutionResult;
}

const ResultBlock: React.FC<ResultBlockProps> = ({ result }) => {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border p-3",
        result.success
          ? "border-accent-green/30 bg-accent-green/5"
          : "border-accent-red/30 bg-accent-red/5"
      )}
    >
      <div className="flex items-center gap-2 text-xs">
        {result.success ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-accent-green" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-accent-red" />
        )}
        <span className="font-medium text-text-primary">
          {t("skillDetail.run.result")}
        </span>
        <span className="text-text-muted tabular-nums">
          {result.durationMs}ms
        </span>
        {result.exitCode !== null && (
          <span className="text-text-muted">
            · {t("skillDetail.run.exitCode", { code: result.exitCode })}
          </span>
        )}
      </div>
      {result.stdout && (
        <OutputPre label={t("skillDetail.run.stdout")} content={result.stdout} />
      )}
      {result.stderr && (
        <OutputPre
          label={t("skillDetail.run.stderr")}
          content={result.stderr}
          tone="error"
        />
      )}
      {!result.stdout && !result.stderr && (
        <pre className="rounded bg-bg-primary p-2 font-mono text-[11px] text-text-muted">
          {t("skillDetail.run.noOutput")}
        </pre>
      )}
    </div>
  );
};

interface OutputPreProps {
  label: string;
  content: string;
  tone?: "default" | "error";
}

const OutputPre: React.FC<OutputPreProps> = ({ label, content, tone = "default" }) => (
  <div className="space-y-1">
    <div className="text-[10px] uppercase tracking-wide text-text-muted">
      {label}
    </div>
    <pre
      className={cn(
        "max-h-48 overflow-auto whitespace-pre-wrap rounded bg-bg-primary p-2 font-mono text-[11px]",
        tone === "error" ? "text-accent-red" : "text-text-primary"
      )}
    >
      {content}
    </pre>
  </div>
);

interface RunParamInputProps {
  param: Parameter;
  value: string;
  onChange: (v: string) => void;
}

const RunParamInput: React.FC<RunParamInputProps> = ({ param, value, onChange }) => {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-text-primary">
        {param.name}
        {param.required && <span className="ml-1 text-accent-red">*</span>}
        <span className="ml-1.5 text-[10px] font-normal text-text-muted">
          ({param.type})
        </span>
      </label>
      {param.description && (
        <p className="mb-1 text-[11px] text-text-muted">{param.description}</p>
      )}
      {param.type === "boolean" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full rounded-md border border-border-default bg-bg-secondary px-2 text-xs text-text-primary focus:border-accent-blue focus:outline-none"
        >
          <option value="">—</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : param.type === "object" || param.type === "array" ? (
        <Textarea
          mono
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.type}
          className="min-h-[64px] text-xs"
        />
      ) : (
        <Input
          type={param.type === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.default?.toString() ?? param.name}
          className="h-8 text-xs"
        />
      )}
    </div>
  );
};
