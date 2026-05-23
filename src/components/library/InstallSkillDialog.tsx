import React from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Loader2,
  Folder,
  Trash2,
  ExternalLink,
  Share2,
  XCircle,
  Bot,
  Zap,
  Code2,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  toast,
} from "@/components/ui";
import {
  useInstallTargets,
  useInstallSkillToTool,
  useUninstallSkillFromTool,
  useSkillInstallations,
  useDetectAiTools,
  type InstallTargetInfo,
  type InstallTargetKind,
} from "@/hooks";
import { useShowInFolder } from "@/hooks";
import { useSettingsStore } from "@/stores";
import type { Skill } from "@/types";

interface InstallSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: Skill | null;
}

async function pickCustomDirectory(): Promise<string | null> {
  try {
    const result = await invoke<string | null>("plugin:dialog|open", {
      options: {
        directory: true,
        multiple: false,
        title: "Choose install directory",
      },
    });
    return result ?? null;
  } catch {
    return null;
  }
}

/** Pick an icon per AI tool — same mapping used across the app for consistency. */
function targetIcon(kind: InstallTargetKind) {
  const cls = "h-4 w-4";
  switch (kind) {
    case "claude":
      return <Bot className={cls} aria-hidden />;
    case "cursor":
      return <Zap className={cls} aria-hidden />;
    case "codex":
      return <Code2 className={cls} aria-hidden />;
    case "gemini":
      return <Sparkles className={cls} aria-hidden />;
    case "agents":
    default:
      return <TerminalSquare className={cls} aria-hidden />;
  }
}

export const InstallSkillDialog: React.FC<InstallSkillDialogProps> = ({
  open,
  onOpenChange,
  skill,
}) => {
  const { t } = useTranslation();
  const { data: targets = [] } = useInstallTargets();
  const { data: detected = [] } = useDetectAiTools();
  const { data: installations = [], refetch } = useSkillInstallations(
    skill?.skillId ?? null
  );
  const installMutation = useInstallSkillToTool();
  const uninstallMutation = useUninstallSkillFromTool();
  const showInFolder = useShowInFolder();
  const { libraryPath } = useSettingsStore();

  const [customPath, setCustomPath] = React.useState("");
  const [pendingKind, setPendingKind] = React.useState<InstallTargetKind | null>(
    null
  );
  const [bulkPending, setBulkPending] = React.useState<"install" | "uninstall" | null>(null);

  if (!skill) return null;

  // Indexed lookups so each row knows its current state without re-iterating.
  const installedByTarget = new Map(
    installations.map((i) => [i.targetPath, i])
  );
  const detectedByKind = new Map(detected.map((d) => [d.kind, d]));

  // Ordering: detected tools first (most likely the user wants them), then
  // remaining standard tools, then "Custom" last.
  const orderedTargets = React.useMemo(() => {
    const score = (t: InstallTargetInfo): number => {
      if (t.kind === "custom") return 3;
      const d = detectedByKind.get(t.kind);
      if (d?.exists) return 0;
      return 1;
    };
    return [...targets].sort((a, b) => score(a) - score(b));
    // Targets / detected lists are stable per session, so deps are minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, detected]);

  // Eligible-for-bulk targets: detected & not the library itself & not already
  // installed (for install-all) / installed (for uninstall-all).
  const bulkEligibleInstall = React.useMemo(() => {
    return orderedTargets.filter((tgt) => {
      if (tgt.kind === "custom") return false;
      const d = detectedByKind.get(tgt.kind);
      if (!d?.exists && tgt.kind !== "agents") return false;
      if (tgt.defaultPath && tgt.defaultPath === libraryPath) return false;
      if (tgt.defaultPath && installedByTarget.has(tgt.defaultPath)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedTargets, detected, libraryPath, installations]);

  const bulkEligibleUninstall = installations;

  const handleInstall = async (target: InstallTargetInfo) => {
    setPendingKind(target.kind);
    try {
      const path =
        target.kind === "custom" ? customPath.trim() || undefined : undefined;
      if (target.kind === "custom" && !path) return;
      await installMutation.mutateAsync({
        skillId: skill.skillId,
        targetKind: target.kind,
        customPath: path,
      });
      await refetch();
    } catch (e) {
      console.error("Install failed:", e);
      toast.error(
        t("installSkill.installFailedToast", { tool: target.label }),
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setPendingKind(null);
    }
  };

  const handleUninstall = async (
    installation: { linkedPath: string; targetPath: string },
    targetKind?: InstallTargetKind
  ) => {
    if (targetKind) setPendingKind(targetKind);
    // Best-effort label for the toast (falls back to the kind string if we
    // don't have a matching target row for any reason — e.g., custom path).
    const toolLabel =
      orderedTargets.find((tt) => tt.kind === targetKind)?.label ??
      String(targetKind ?? "");
    try {
      await uninstallMutation.mutateAsync({
        skillId: skill.skillId,
        linkedPath: installation.linkedPath,
        targetPath: installation.targetPath,
      });
      await refetch();
    } catch (e) {
      console.error("Uninstall failed:", e);
      toast.error(
        t("skillCard.toast.uninstallFailed", { tool: toolLabel }),
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      if (targetKind) setPendingKind(null);
    }
  };

  // Bulk: install into every detected tool (except library + custom). Failures
  // accumulate but never abort the loop, mirroring the LibraryView batch install.
  const handleInstallAll = async () => {
    setBulkPending("install");
    let ok = 0;
    let fail = 0;
    for (const target of bulkEligibleInstall) {
      try {
        await installMutation.mutateAsync({
          skillId: skill.skillId,
          targetKind: target.kind,
        });
        ok++;
      } catch (e) {
        fail++;
        console.error(`Install to ${target.kind} failed:`, e);
      }
    }
    await refetch();
    setBulkPending(null);
    if (ok > 0) {
      toast.success(
        t("installSkill.bulk.installed", { count: ok }),
        fail > 0
          ? t("installSkill.bulk.partialFailed", { count: fail })
          : undefined
      );
    } else if (fail > 0) {
      toast.error(t("installSkill.bulk.allFailed"));
    }
  };

  const handleUninstallAll = async () => {
    setBulkPending("uninstall");
    let ok = 0;
    let fail = 0;
    for (const inst of bulkEligibleUninstall) {
      try {
        await uninstallMutation.mutateAsync({
          skillId: skill.skillId,
          linkedPath: inst.linkedPath,
          targetPath: inst.targetPath,
        });
        ok++;
      } catch (e) {
        fail++;
        console.error("Uninstall failed:", e);
      }
    }
    await refetch();
    setBulkPending(null);
    if (ok > 0) {
      // Mirror the install path: surface partial failures as a sub-message so
      // the user knows that not everything succeeded, instead of silently
      // dropping that detail like the previous version did.
      toast.success(
        t("installSkill.bulk.uninstalled", { count: ok }),
        fail > 0
          ? t("installSkill.bulk.partialFailed", { count: fail })
          : undefined
      );
    } else if (fail > 0) {
      toast.error(t("installSkill.bulk.allFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("installSkill.title", "Install to AI tool")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "installSkill.description",
              "Creates a symbolic link from this skill into the target tool's skills directory. The tool will discover the skill on next launch."
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Status summary + bulk actions. Shows the user "where is this active
            right now" without forcing them to scan every chip. */}
        <div className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-tertiary px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-text-primary">
              {installations.length > 0
                ? t("installSkill.activeInCount", {
                    count: installations.length,
                  })
                : t("installSkill.notActiveAnywhere")}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-text-muted">
              {bulkEligibleInstall.length > 0
                ? t("installSkill.bulk.installHint", {
                    count: bulkEligibleInstall.length,
                  })
                : t("installSkill.bulk.nothingToDo")}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleInstallAll}
              disabled={bulkPending !== null || bulkEligibleInstall.length === 0}
            >
              {bulkPending === "install" ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Share2 className="mr-1 h-3.5 w-3.5" />
              )}
              {t("installSkill.bulk.installAll")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleUninstallAll}
              disabled={
                bulkPending !== null || bulkEligibleUninstall.length === 0
              }
            >
              {bulkPending === "uninstall" ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="mr-1 h-3.5 w-3.5" />
              )}
              {t("installSkill.bulk.uninstallAll")}
            </Button>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto py-2">
          {orderedTargets.map((target) => {
            const installed =
              target.defaultPath && installedByTarget.get(target.defaultPath);
            const isCustom = target.kind === "custom";
            const detection = detectedByKind.get(target.kind);
            const detectedExists = detection?.exists ?? false;
            // The default library path is itself a well-known skill directory.
            // Installing the skill there is a no-op (it's already discovered), so
            // we surface that state instead of letting the user trigger an error.
            const isLibraryItself =
              !!target.defaultPath &&
              !!libraryPath &&
              target.defaultPath === libraryPath;

            const isPending = pendingKind === target.kind;

            return (
              <div
                key={target.kind}
                className={cn(
                  "flex items-start gap-3 rounded-lg border bg-bg-secondary p-3 transition-colors",
                  installed
                    ? "border-accent-blue/40"
                    : "border-border-default",
                  !detectedExists &&
                    !isCustom &&
                    target.kind !== "agents" &&
                    "opacity-70"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    installed
                      ? "bg-accent-blue text-white"
                      : detectedExists
                      ? "bg-accent-blue/10 text-accent-blue"
                      : "bg-bg-tertiary text-text-muted"
                  )}
                >
                  {targetIcon(target.kind)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-text-primary">
                      {target.label}
                    </span>
                    {!isCustom && target.kind !== "agents" && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
                          detectedExists
                            ? "bg-accent-green/15 text-accent-green"
                            : "bg-bg-tertiary text-text-muted"
                        )}
                      >
                        {detectedExists
                          ? t("integrations.status.detected")
                          : t("integrations.status.notInstalled")}
                      </span>
                    )}
                  </div>
                  {target.defaultPath && (
                    <div className="mt-0.5 truncate font-mono text-[10px] text-text-muted" title={target.defaultPath}>
                      {target.defaultPath}
                    </div>
                  )}
                  {isCustom && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        value={customPath}
                        onChange={(e) => setCustomPath(e.target.value)}
                        placeholder="/absolute/path/to/skills/dir"
                        className="flex-1 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const picked = await pickCustomDirectory();
                          if (picked) setCustomPath(picked);
                        }}
                      >
                        <Folder className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {installed && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-accent-green">
                      <CheckCircle2 className="h-3 w-3" />
                      <span className="truncate font-mono" title={installed.linkedPath}>
                        {installed.linkedPath}
                      </span>
                    </div>
                  )}
                  {isLibraryItself && !installed && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-accent-green">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>
                        {t(
                          "installSkill.alreadyInLibrary",
                          "Already in your skill library"
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {isLibraryItself && !installed ? null : installed ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          showInFolder.mutate(installed.linkedPath)
                        }
                        title={t("common.revealInFinder", "Reveal")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-accent-red"
                        onClick={() =>
                          handleUninstall(installed, target.kind as InstallTargetKind)
                        }
                        disabled={isPending || uninstallMutation.isPending}
                        title={t("installSkill.uninstall", "Uninstall")}
                      >
                        {isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleInstall(target)}
                      disabled={
                        isPending ||
                        installMutation.isPending ||
                        (isCustom && !customPath.trim())
                      }
                    >
                      {isPending && installMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        t("installSkill.install", "Install")
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.close", "Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
