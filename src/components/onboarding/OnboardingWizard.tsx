import React from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Folder,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Bot,
  Zap,
  Code2,
  TerminalSquare,
  Rocket,
  Palette,
  Check,
  ExternalLink,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  useDetectAiTools,
  useSetLibraryPath,
  useEnsureDefaultSkillPath,
  useImportGitHubSkill,
  useInstallSkillToTool,
  useUpdateAppSetting,
  useDefaultPaths,
  type DetectedAiTool,
  type InstallTargetKind,
} from "@/hooks";
import type { Skill } from "@/types";
import { useSettingsStore } from "@/stores";
import { useQueryClient } from "@tanstack/react-query";
import { skillKeys } from "@/hooks/useSkills";
import { installKeys } from "@/hooks/useInstall";

// ========== Types ==========

interface OnboardingWizardProps {
  open: boolean;
  /** Called after the user finishes (or skips) every step. */
  onComplete: () => void;
}

/** A starter skill we offer to import in step 3. We only show one to keep step 3 dead-simple. */
interface StarterSkill {
  name: string;
  description: string;
  /** Path within the anthropics/skills repo. */
  path: string;
  icon: React.ReactNode;
}

const STARTER_SKILL: StarterSkill = {
  name: "frontend-design",
  description:
    "Create production-grade frontend interfaces with high design quality. Great for testing the import → install flow.",
  path: "skills/frontend-design",
  icon: <Palette className="h-5 w-5" />,
};

// ========== Step icons ==========

function aiToolIcon(kind: string) {
  switch (kind) {
    case "claude":
      return <Bot className="h-4 w-4" />;
    case "cursor":
      return <Zap className="h-4 w-4" />;
    case "codex":
      return <Code2 className="h-4 w-4" />;
    case "gemini":
      return <Sparkles className="h-4 w-4" />;
    default:
      return <TerminalSquare className="h-4 w-4" />;
  }
}

// ========== Main wizard ==========

/**
 * First-launch wizard that runs immediately after the language selector. Three
 * lightweight steps:
 *   1. Confirm the library path (pre-fills with the cross-tool standard).
 *   2. Pick AI tools to auto-install new skills into (pre-checked from `detect_ai_tools`).
 *   3. Optional: import a starter skill so the user has something to look at.
 *
 * On finish we set `setupCompleted = true`, so this only ever runs once unless
 * the settings JSON is wiped.
 */
export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  open,
  onComplete,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { setLibraryPath: setLibraryPathStore } = useSettingsStore();

  const [step, setStep] = React.useState(0);
  const [libraryPath, setLibraryPath] = React.useState("");
  const [selectedTools, setSelectedTools] = React.useState<Set<InstallTargetKind>>(
    new Set()
  );
  const [starterStatus, setStarterStatus] = React.useState<
    "idle" | "importing" | "imported" | "skipped" | "failed"
  >("idle");
  const [starterError, setStarterError] = React.useState<string | null>(null);
  const [finishing, setFinishing] = React.useState(false);

  const { data: defaults } = useDefaultPaths();
  const { data: detected = [] } = useDetectAiTools();
  const setLibraryPathMutation = useSetLibraryPath();
  const ensureDefaultPath = useEnsureDefaultSkillPath();
  const importGitHubSkill = useImportGitHubSkill();
  const installMutation = useInstallSkillToTool();
  const updateSetting = useUpdateAppSetting();

  // Seed the library path input as soon as we know the default.
  React.useEffect(() => {
    if (!libraryPath && defaults?.skillLibraryPath) {
      setLibraryPath(defaults.skillLibraryPath);
    }
  }, [defaults?.skillLibraryPath, libraryPath]);

  // Seed AI tool checkboxes once detection runs.
  React.useEffect(() => {
    if (detected.length > 0 && selectedTools.size === 0) {
      const seed = detected.filter((d) => d.exists).map((d) => d.kind as InstallTargetKind);
      setSelectedTools(new Set(seed));
    }
  }, [detected, selectedTools.size]);

  // Reset to step 0 every time we (re)open (the wizard is mounted across the
  // whole session but `open` toggles).
  React.useEffect(() => {
    if (open) {
      setStep(0);
      setStarterStatus("idle");
      setStarterError(null);
    }
  }, [open]);

  const toggleTool = (kind: InstallTargetKind) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const handleSelectFolder = async () => {
    try {
      const result = await invoke<string | null>("plugin:dialog|open", {
        options: {
          directory: true,
          multiple: false,
          title: t("onboarding.step1.pickFolder"),
        },
      });
      if (result && typeof result === "string") {
        setLibraryPath(result);
      }
    } catch (e) {
      console.error("Folder dialog failed:", e);
    }
  };

  // ===== Step transition helpers =====

  const goToStep2 = async () => {
    try {
      // Persist library path. We call ensure first so the directory exists,
      // matching the behavior of the Settings "Use Default" button.
      if (
        libraryPath === defaults?.skillLibraryPath ||
        !libraryPath.trim()
      ) {
        const ensured = await ensureDefaultPath.mutateAsync();
        await setLibraryPathMutation.mutateAsync(ensured);
        setLibraryPathStore(ensured);
        setLibraryPath(ensured);
      } else {
        await setLibraryPathMutation.mutateAsync(libraryPath);
        setLibraryPathStore(libraryPath);
      }
    } catch (e) {
      // Persistence failure here is non-fatal — the user can fix it in Settings.
      console.error("Failed to set library path:", e);
    }
    setStep(1);
  };

  const goToStep3 = async () => {
    const targets = Array.from(selectedTools);
    try {
      await updateSetting.mutateAsync({
        key: "autoInstallTargets",
        value: targets.join(","),
      });
    } catch (e) {
      console.error("Failed to persist autoInstallTargets:", e);
    }
    setStep(2);
  };

  const handleImportStarter = async () => {
    setStarterStatus("importing");
    setStarterError(null);
    try {
      const skill = await importGitHubSkill.mutateAsync({
        owner: "anthropics",
        repo: "skills",
        branch: "main",
        path: STARTER_SKILL.path,
      });

      // After import we symlink into every selected AI tool so the user
      // can really see the "everywhere your AI is" promise.
      const imported = skill as Skill;
      for (const kind of Array.from(selectedTools)) {
        try {
          await installMutation.mutateAsync({
            skillId: imported.skillId,
            targetKind: kind,
          });
        } catch (e) {
          console.warn(`Install to ${kind} failed:`, e);
        }
      }

      // Refresh caches so Home view picks it up immediately.
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
      queryClient.invalidateQueries({ queryKey: installKeys.all });

      setStarterStatus("imported");
    } catch (e) {
      setStarterStatus("failed");
      setStarterError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSkipStarter = () => {
    setStarterStatus("skipped");
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      // Mark onboarding done. The existing flow uses `setupCompleted` for the
      // language step; we deliberately overload it so subsequent launches
      // skip both surfaces in one check.
      await updateSetting.mutateAsync({
        key: "setupCompleted",
        value: "true",
      });
    } catch (e) {
      console.error("Failed to mark setup complete:", e);
    } finally {
      setFinishing(false);
      onComplete();
    }
  };

  // ===== Render =====

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // The wizard is non-dismissable by clicking outside. The user must
        // either finish or hit the "Skip for now" path on step 3 (which
        // still marks setupCompleted via handleFinish).
        if (!o) return;
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 0 && <Rocket className="h-5 w-5 text-accent-blue" />}
            {step === 1 && <Sparkles className="h-5 w-5 text-accent-purple" />}
            {step === 2 && <CheckCircle2 className="h-5 w-5 text-accent-green" />}
            {t(`onboarding.step${step + 1}.title`)}
          </DialogTitle>
          <DialogDescription>
            {t(`onboarding.step${step + 1}.description`)}
          </DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div className="my-2 flex items-center justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step
                  ? "w-6 bg-accent-blue"
                  : i < step
                  ? "w-1.5 bg-accent-blue/40"
                  : "w-1.5 bg-border-default"
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[180px] py-2">
          {step === 0 && (
            <StepLibrary
              path={libraryPath}
              onChange={setLibraryPath}
              onPickFolder={handleSelectFolder}
              defaultPath={defaults?.skillLibraryPath}
            />
          )}
          {step === 1 && (
            <StepTools
              detected={detected}
              selected={selectedTools}
              onToggle={toggleTool}
            />
          )}
          {step === 2 && (
            <StepStarter
              status={starterStatus}
              error={starterError}
              onImport={handleImportStarter}
              onSkip={handleSkipStarter}
            />
          )}
        </div>

        {/* Footer navigation */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-default pt-3">
          <div className="text-xs text-text-muted">
            {t("onboarding.stepN", { step: step + 1, total: 3 })}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && !finishing && (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                {t("common.back")}
              </Button>
            )}
            {step === 0 && (
              <Button onClick={goToStep2} disabled={!libraryPath.trim()}>
                {t("common.next")}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}
            {step === 1 && (
              <Button onClick={goToStep3}>
                {t("common.next")}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}
            {step === 2 && (
              <Button onClick={handleFinish} disabled={finishing}>
                {finishing && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {t("onboarding.finish")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ========== Step 1: Library path ==========

interface StepLibraryProps {
  path: string;
  onChange: (v: string) => void;
  onPickFolder: () => void;
  defaultPath?: string;
}

const StepLibrary: React.FC<StepLibraryProps> = ({
  path,
  onChange,
  onPickFolder,
  defaultPath,
}) => {
  const { t } = useTranslation();
  const isDefault = !!defaultPath && path === defaultPath;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border-default bg-bg-secondary p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
          <Folder className="h-3.5 w-3.5" />
          {t("onboarding.step1.libraryLabel")}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={path}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("onboarding.step1.pathPlaceholder")}
            className="font-mono text-xs"
          />
          <Button variant="secondary" size="sm" onClick={onPickFolder}>
            {t("common.browse")}
          </Button>
        </div>
        {isDefault && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-accent-green">
            <CheckCircle2 className="h-3 w-3" />
            {t("onboarding.step1.crossToolHint")}
          </p>
        )}
      </div>
      <p className="text-xs text-text-muted">
        {t("onboarding.step1.philosophyHint")}
      </p>
    </div>
  );
};

// ========== Step 2: AI tools ==========

interface StepToolsProps {
  detected: DetectedAiTool[];
  selected: Set<InstallTargetKind>;
  onToggle: (kind: InstallTargetKind) => void;
}

/**
 * Official installation URLs for each supported AI tool. Surfaced in
 * StepTools when nothing is detected on disk so the user gets a clear
 * next step instead of a dead-end "0 tools" screen.
 */
const AI_TOOL_INSTALL_URLS: Record<string, string> = {
  claude: "https://docs.claude.com/en/docs/claude-code/quickstart",
  cursor: "https://www.cursor.com/downloads",
  codex: "https://github.com/openai/codex",
  gemini: "https://github.com/google-gemini/gemini-cli",
};

async function openExternalUrl(url: string): Promise<void> {
  try {
    await invoke("plugin:opener|open_url", { url });
  } catch (e) {
    // Fallback for environments without the opener plugin loaded.
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

const StepTools: React.FC<StepToolsProps> = ({ detected, selected, onToggle }) => {
  const { t } = useTranslation();

  // Hide the cross-tool "Agent Skills standard" entry here — the user picks
  // concrete AI tools (Claude / Cursor / Codex / Gemini) to install into; the
  // cross-tool ~/.agents/skills/ target is reachable later from the
  // InstallSkillDialog and the SkillCard install badges.
  const tools = detected.filter((d) => d.kind !== "agents");
  const installedTools = tools.filter((d) => d.exists);
  const noToolsDetected = installedTools.length === 0;

  return (
    <div className="space-y-3">
      {tools.length === 0 ? (
        <p className="text-sm text-text-muted">{t("onboarding.step2.noneDetected")}</p>
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => {
            const checked = selected.has(tool.kind as InstallTargetKind);
            return (
              <label
                key={tool.kind}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                  checked
                    ? "border-accent-blue bg-accent-blue/10"
                    : "border-border-default bg-bg-secondary hover:border-border-hover",
                  !tool.exists && "opacity-60"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(tool.kind as InstallTargetKind)}
                  className="h-4 w-4"
                />
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    tool.exists
                      ? "bg-accent-blue/10 text-accent-blue"
                      : "bg-bg-tertiary text-text-muted"
                  )}
                >
                  {aiToolIcon(tool.kind)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary">
                    {tool.label}
                  </div>
                  <div className="truncate font-mono text-[11px] text-text-muted">
                    {tool.path.replace(/^.*\/(\.[^/]+\/skills)$/, "~/$1")}
                  </div>
                </div>
                {tool.exists ? (
                  <span className="text-xs text-accent-green">
                    <Check className="inline h-3.5 w-3.5" />
                  </span>
                ) : AI_TOOL_INSTALL_URLS[tool.kind] ? (
                  // Inline "Install" link for rows the user hasn't set up on
                  // their machine yet. Clicking opens the official docs in
                  // their browser — we don't try to install the CLI ourselves
                  // because that would require admin / shell integration.
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void openExternalUrl(AI_TOOL_INSTALL_URLS[tool.kind]);
                    }}
                    className="flex items-center gap-1 rounded-md border border-border-default px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-accent-blue hover:text-accent-blue"
                  >
                    {t("onboarding.step2.installCli")}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                ) : (
                  <span className="text-[11px] text-text-muted">
                    {t("home.detectedTools.notInstalled")}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}

      {/* Empty-detected banner. Shows when no AI tool dir exists on disk —
          guides the user to install at least one CLI so the rest of the
          app actually has somewhere to install skills into. */}
      {noToolsDetected && tools.length > 0 && (
        <div className="rounded-xl border border-dashed border-accent-yellow/40 bg-accent-yellow/5 p-3">
          <p className="text-xs font-medium text-text-primary">
            {t("onboarding.step2.noneInstalledTitle")}
          </p>
          <p className="mt-1 text-[11px] text-text-secondary">
            {t("onboarding.step2.noneInstalledHint")}
          </p>
          <p className="mt-2 text-[11px] text-text-muted">
            {t("onboarding.step2.crossToolFallback")}
          </p>
        </div>
      )}
    </div>
  );
};

// ========== Step 3: Try a starter skill ==========

interface StepStarterProps {
  status: "idle" | "importing" | "imported" | "skipped" | "failed";
  error: string | null;
  onImport: () => void;
  onSkip: () => void;
}

const StepStarter: React.FC<StepStarterProps> = ({
  status,
  error,
  onImport,
  onSkip,
}) => {
  const { t } = useTranslation();

  if (status === "imported" || status === "skipped") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-green/15">
          <CheckCircle2 className="h-6 w-6 text-accent-green" />
        </div>
        <p className="text-sm font-medium text-text-primary">
          {status === "imported"
            ? t("onboarding.step3.imported")
            : t("onboarding.step3.skipped")}
        </p>
        <p className="max-w-sm text-xs text-text-muted">
          {t("onboarding.step3.afterHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border-default bg-bg-secondary p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-purple/10 text-accent-purple">
            {STARTER_SKILL.icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">
              {STARTER_SKILL.name}
            </p>
            <p className="text-xs text-text-secondary">
              {STARTER_SKILL.description}
            </p>
          </div>
        </div>
      </div>
      {status === "failed" && error && (
        <p className="rounded-lg bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button onClick={onImport} disabled={status === "importing"} className="flex-1">
          {status === "importing" && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          {t("onboarding.step3.tryIt")}
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={status === "importing"}>
          {t("onboarding.step3.skip")}
        </Button>
      </div>
    </div>
  );
};
