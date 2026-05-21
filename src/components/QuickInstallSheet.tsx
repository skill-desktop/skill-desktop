import React from "react";
import { useTranslation } from "react-i18next";
import {
  UploadCloud,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  ShieldAlert,
} from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  toast,
} from "@/components/ui";
import {
  useDetectAiTools,
  useInstallSkillToTool,
  useLoadAppSettings,
  useUpdateAppSetting,
  type DetectedAiTool,
  type InstallTargetKind,
} from "@/hooks";
import { skillKeys } from "@/hooks/useSkills";
import { installKeys } from "@/hooks/useInstall";
import type { Skill } from "@/types";

// ========== Types ==========

/** Tauri 2.x drag-drop payload shape (see @tauri-apps/api/event). */
interface TauriDragDropPayload {
  type: "over" | "drop" | "leave" | "enter";
  paths?: string[];
}

/** A file we picked up from the drop, plus what `preview_local_skill` told us about it. */
interface PendingItem {
  path: string;
  status: "previewing" | "ready" | "error" | "importing" | "imported" | "skipped" | "failed";
  /** Skill metadata from the preview backend. */
  name?: string;
  description?: string;
  /** Risk level surfaced by `preview_local_skill`. */
  riskLevel?: "low" | "medium" | "high";
  error?: string;
  /** Filled after a successful import. */
  importedSkill?: Skill;
}

// Loose shape of what the preview command returns. We don't depend on the
// shared SkillPreview type because it pulls in heavier imports we don't need.
interface PreviewResponse {
  metadata: { name?: string; description?: string };
  riskAnalysis?: { overallLevel?: "low" | "medium" | "high" };
}

// ========== Hook: global drag-drop subscription ==========

/**
 * Subscribe to Tauri's native drag-drop events at the App level. We only fire
 * `onDrop` for `type: "drop"` events that carry at least one path, and we
 * silently bail when the Import dialog is in the foreground (its LocalImportPanel
 * is already listening — letting both fire would double-import).
 */
function useGlobalFileDrop(onDrop: (paths: string[]) => void) {
  // Latest callback ref, so we can re-bind cleanly without re-creating the
  // Tauri listener on every render.
  const cbRef = React.useRef(onDrop);
  React.useEffect(() => {
    cbRef.current = onDrop;
  }, [onDrop]);

  React.useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    (async () => {
      unlisten = await listen<TauriDragDropPayload>("tauri://drag-drop", (e) => {
        const payload = e.payload;
        if (payload?.type !== "drop") return;
        const paths = payload.paths ?? [];
        if (paths.length === 0) return;
        // Bail when another capture surface (Import dialog) is open.
        if (useAppStore.getState().importDialogActive) return;
        cbRef.current(paths);
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);
}

// ========== Component ==========

/**
 * `QuickInstallSheet` is the global "drop a skill file anywhere → done" surface.
 *
 * It's mounted once at the root of the React tree. When the user drops files
 * onto the Tauri window:
 *   1. The sheet opens and previews each path via `preview_local_skill`.
 *   2. The user picks which AI tools to symlink the imported skills into
 *      (defaults to whatever AI tool dirs we detected on disk, intersected
 *      with the user's previous selection from `autoInstallTargets`).
 *   3. On Install, we run `import_local_skill` (singular, so we get the new
 *      skill_id back) + `install_skill_to_tool` per (skill × selected tool).
 *   4. We persist the user's selection back to `autoInstallTargets` so the
 *      next drop defaults to the same set.
 *
 * Failure handling stays inline — bad / oversized / duplicate files are kept
 * in the list with an explicit error label rather than vanishing silently.
 */
export const QuickInstallSheet: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<PendingItem[]>([]);
  const [selectedTools, setSelectedTools] = React.useState<Set<InstallTargetKind>>(
    new Set()
  );
  const [isInstalling, setIsInstalling] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const { data: detected = [] } = useDetectAiTools();
  const { data: appSettings } = useLoadAppSettings();
  const updateSetting = useUpdateAppSetting();
  const installMutation = useInstallSkillToTool();

  // Latest isInstalling, exposed via ref so handleDrop's closure (created
  // before each drop event) can read the up-to-date value without being
  // a useCallback dependency.
  const isInstallingRef = React.useRef(false);
  React.useEffect(() => {
    isInstallingRef.current = isInstalling;
  }, [isInstalling]);

  // When the user drops files, we open the sheet and start previewing.
  const handleDrop = React.useCallback(async (paths: string[]) => {
    // Don't clobber an in-progress install — a fresh drop while we're in
    // the middle of `import_local_skill` + `install_skill_to_tool` would
    // make the in-flight status updates target the wrong items list and
    // could confuse the user about what's actually been imported.
    if (isInstallingRef.current) {
      toast.warning(
        t("quickInstall.installInProgress"),
        t("quickInstall.installInProgressHint")
      );
      return;
    }

    // Seed the items list immediately so the user sees what they dropped.
    setItems(paths.map((p) => ({ path: p, status: "previewing" })));
    setDone(false);
    setOpen(true);

    // Kick off a preview for each path in parallel — they're independent.
    await Promise.all(
      paths.map(async (path) => {
        try {
          const preview = await invoke<PreviewResponse>("preview_local_skill", {
            path,
          });
          setItems((prev) =>
            prev.map((it) =>
              it.path === path
                ? {
                    ...it,
                    status: "ready",
                    name: preview.metadata?.name,
                    description: preview.metadata?.description,
                    riskLevel: preview.riskAnalysis?.overallLevel,
                  }
                : it
            )
          );
        } catch (err) {
          setItems((prev) =>
            prev.map((it) =>
              it.path === path
                ? {
                    ...it,
                    status: "error",
                    error: err instanceof Error ? err.message : String(err),
                  }
                : it
            )
          );
        }
      })
    );
  }, []);

  useGlobalFileDrop(handleDrop);

  // Seed the tool checkboxes when the sheet opens. Priority:
  //   1. User's saved `autoInstallTargets` (intersected with currently-detected)
  //   2. Otherwise all tools whose dir exists on disk
  //   3. Otherwise nothing (user has to manually check things)
  React.useEffect(() => {
    if (!open) return;
    const saved = (appSettings?.autoInstallTargets ?? []) as InstallTargetKind[];
    const detectedKinds = detected
      .filter((d) => d.exists)
      .map((d) => d.kind as InstallTargetKind);
    const seed = saved.length > 0
      ? saved.filter((k) => detectedKinds.includes(k))
      : detectedKinds;
    setSelectedTools(new Set(seed));
  }, [open, appSettings?.autoInstallTargets, detected]);

  const toggleTool = (kind: InstallTargetKind) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const handleClose = () => {
    if (isInstalling) return;
    setOpen(false);
    setItems([]);
    setDone(false);
  };

  const importableCount = items.filter((it) => it.status === "ready").length;

  const handleInstall = async () => {
    setIsInstalling(true);
    const targets = Array.from(selectedTools);

    // Persist the selection so future drops default to the same set. We do this
    // up-front (not after success) so even if some imports fail, the user's
    // preference still sticks.
    try {
      await updateSetting.mutateAsync({
        key: "autoInstallTargets",
        value: targets.join(","),
      });
    } catch (e) {
      // Non-fatal: settings persistence is a nice-to-have, not blocking.
      console.error("Failed to persist autoInstallTargets:", e);
    }

    for (const item of items) {
      if (item.status !== "ready") continue;

      setItems((prev) =>
        prev.map((it) =>
          it.path === item.path ? { ...it, status: "importing" } : it
        )
      );

      // Step 1: import into the library.
      let imported: Skill | null = null;
      try {
        imported = await invoke<Skill>("import_local_skill", {
          path: item.path,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isSkip = message.startsWith("Skipped:");
        setItems((prev) =>
          prev.map((it) =>
            it.path === item.path
              ? {
                  ...it,
                  status: isSkip ? "skipped" : "failed",
                  error: message,
                }
              : it
          )
        );
        continue;
      }

      // Step 2: symlink into each selected AI tool. Failures here aren't
      // fatal — the skill is already in the library, the user can install
      // later from SkillCard badges.
      for (const kind of targets) {
        try {
          await installMutation.mutateAsync({
            skillId: imported.skillId,
            targetKind: kind,
          });
        } catch (e) {
          console.warn(`Install to ${kind} failed:`, e);
        }
      }

      setItems((prev) =>
        prev.map((it) =>
          it.path === item.path
            ? { ...it, status: "imported", importedSkill: imported ?? undefined }
            : it
        )
      );
    }

    // Refresh the library + installation queries so the rest of the UI updates.
    queryClient.invalidateQueries({ queryKey: skillKeys.all });
    queryClient.invalidateQueries({ queryKey: installKeys.all });

    setIsInstalling(false);
    setDone(true);

    // Summary toast — gives users a clean confirmation even if they close the
    // sheet right away. We use the freshest snapshot of items via the setter
    // callback (less brittle than `items`, which closes over stale state).
    setItems((finalItems) => {
      const imported = finalItems.filter((i) => i.status === "imported").length;
      const failed = finalItems.filter(
        (i) => i.status === "failed" || i.status === "error"
      ).length;
      const skipped = finalItems.filter((i) => i.status === "skipped").length;

      if (imported > 0) {
        toast.success(
          t("quickInstall.toast.success", { count: imported }),
          failed > 0
            ? t("quickInstall.toast.partialFailed", { count: failed })
            : skipped > 0
            ? t("quickInstall.toast.skipped", { count: skipped })
            : undefined
        );
      } else if (failed > 0) {
        toast.error(
          t("quickInstall.toast.allFailed", { count: failed })
        );
      }
      return finalItems;
    });
  };

  // The list of tools we offer in the checkboxes. We include all detected
  // tools (existence ✓), plus the "agents" cross-tool standard regardless,
  // so the user always has at least one option.
  const offeredTools = React.useMemo(() => {
    const list: DetectedAiTool[] = detected.filter(
      (d) => d.exists || d.kind === "agents"
    );
    return list.length > 0 ? list : detected;
  }, [detected]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className="max-w-xl"
        onClose={handleClose}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-accent-blue" />
            {done
              ? t("quickInstall.titleDone")
              : t("quickInstall.title", { count: items.length })}
          </DialogTitle>
          <DialogDescription>
            {done
              ? t("quickInstall.descriptionDone")
              : t("quickInstall.description")}
          </DialogDescription>
        </DialogHeader>

        {/* Items list */}
        <div className="my-3 max-h-[40vh] space-y-2 overflow-auto pr-1">
          {items.map((item) => (
            <PendingItemRow key={item.path} item={item} />
          ))}
        </div>

        {/* AI tool checkboxes — only shown before install */}
        {!done && (
          <div className="space-y-2 border-t border-border-default pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {t("quickInstall.installTo")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {offeredTools.map((tool) => {
                const checked = selectedTools.has(tool.kind as InstallTargetKind);
                return (
                  <label
                    key={tool.kind}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                      checked
                        ? "border-accent-blue bg-accent-blue/10"
                        : "border-border-default bg-bg-secondary hover:border-border-hover",
                      !tool.exists && "opacity-60"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTool(tool.kind as InstallTargetKind)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 truncate text-sm text-text-primary">
                      {tool.label}
                    </span>
                    {!tool.exists && (
                      <span className="text-[10px] text-text-muted">
                        {t("home.detectedTools.notInstalled")}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-text-muted">
            {!done && importableCount > 0
              ? t("quickInstall.readyCount", { count: importableCount })
              : null}
          </span>
          <div className="flex gap-2">
            {done ? (
              <Button onClick={handleClose}>{t("common.done")}</Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={handleClose}
                  disabled={isInstalling}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleInstall}
                  disabled={isInstalling || importableCount === 0}
                >
                  {isInstalling ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {t("quickInstall.installButton", { count: importableCount })}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ========== Per-item row ==========

const PendingItemRow: React.FC<{ item: PendingItem }> = ({ item }) => {
  const { t } = useTranslation();

  const statusElement = (() => {
    switch (item.status) {
      case "previewing":
        return <Loader2 className="h-4 w-4 animate-spin text-text-muted" />;
      case "ready":
        return <UploadCloud className="h-4 w-4 text-accent-blue" />;
      case "importing":
        return <Loader2 className="h-4 w-4 animate-spin text-accent-blue" />;
      case "imported":
        return <CheckCircle2 className="h-4 w-4 text-accent-green" />;
      case "skipped":
        return <AlertTriangle className="h-4 w-4 text-accent-yellow" />;
      case "failed":
      case "error":
        return <XCircle className="h-4 w-4 text-accent-red" />;
    }
  })();

  const filename = item.path.split("/").pop() ?? item.path;
  const title = item.name || filename;
  const subtitle = item.description || item.error || item.path;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-2.5",
        item.status === "imported"
          ? "border-accent-green/40 bg-accent-green/5"
          : item.status === "failed" || item.status === "error"
          ? "border-accent-red/40 bg-accent-red/5"
          : item.status === "skipped"
          ? "border-accent-yellow/40 bg-accent-yellow/5"
          : "border-border-default bg-bg-secondary"
      )}
    >
      <div className="mt-0.5 shrink-0">{statusElement}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-text-primary">
            {title}
          </span>
          {item.riskLevel && item.riskLevel !== "low" && (
            <span
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
                item.riskLevel === "high"
                  ? "bg-accent-red/10 text-accent-red"
                  : "bg-accent-yellow/10 text-accent-yellow"
              )}
            >
              <ShieldAlert className="h-3 w-3" />
              {t(`quickInstall.risk.${item.riskLevel}`)}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-text-muted">{subtitle}</div>
      </div>
      <X className="invisible h-4 w-4" />
    </div>
  );
};
