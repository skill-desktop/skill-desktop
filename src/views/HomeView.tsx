import React from "react";
import { useTranslation } from "react-i18next";
import {
  FolderOpen,
  Sparkles,
  Plus,
  UploadCloud,
  ArrowRight,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Bot,
  Zap,
  Code2,
  TerminalSquare,
  Layers,
  Download,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useSettingsStore } from "@/stores";
import {
  useSkills,
  useDetectAiTools,
  useShowInFolder,
  useRescanLibrary,
  useAllSkillInstallations,
  useInstallSkillToTool,
  useLoadAppSettings,
  useCheckAllSkillUpdates,
  type DetectedAiTool,
  type InstallTargetKind,
  type SkillUpdateInfo,
} from "@/hooks";
import { useUpdateSkillFromUrl } from "@/hooks/useImport";
import { Button, Section, ScrollArea, toast } from "@/components/ui";
import { SkillInstallBadges } from "@/components/library/SkillInstallBadges";
import { ImportSkillDialog } from "@/components/library/ImportSkillDialog";
import { CreateSkillDialog } from "@/components/library/CreateSkillDialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Skill } from "@/types";

/**
 * Tiny icon picker keyed off the AI tool kind. We deliberately don't reuse
 * the badge glyph from `SkillInstallBadges` here — Home gets the full Lucide
 * icons because the cards are bigger and we want them recognisable at a
 * glance.
 */
function aiToolIcon(kind: string) {
  switch (kind) {
    case "claude":
      return <Bot className="h-5 w-5" />;
    case "cursor":
      return <Zap className="h-5 w-5" />;
    case "codex":
      return <Code2 className="h-5 w-5" />;
    case "gemini":
      return <Sparkles className="h-5 w-5" />;
    case "agents":
    default:
      return <TerminalSquare className="h-5 w-5" />;
  }
}

interface QuickActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  accent?: "blue" | "purple" | "green";
}

const QuickActionCard: React.FC<QuickActionCardProps> = ({
  icon,
  title,
  description,
  onClick,
  accent = "blue",
}) => {
  // Accent maps to the icon halo's tint. We deliberately keep cards visually
  // distinct so the user can build muscle memory for "blue = import,
  // purple = examples, green = create".
  const accentBg = {
    blue: "bg-accent-blue/10 text-accent-blue",
    purple: "bg-accent-purple/10 text-accent-purple",
    green: "bg-accent-green/10 text-accent-green",
  }[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-full flex-col items-start gap-3 rounded-2xl border border-border-default bg-bg-secondary p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-hover hover:shadow-md"
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          accentBg
        )}
      >
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-text-primary">{title}</p>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>
      <ArrowRight className="absolute right-4 top-4 h-4 w-4 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
};

interface DetectedToolCardProps {
  tool: DetectedAiTool;
  onOpen: (path: string) => void;
}

const DetectedToolCard: React.FC<DetectedToolCardProps> = ({ tool, onOpen }) => {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-colors",
        tool.exists
          ? "border-border-default bg-bg-secondary"
          : "border-dashed border-border-muted bg-bg-secondary/40"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg",
          tool.exists
            ? "bg-accent-blue/10 text-accent-blue"
            : "bg-bg-tertiary text-text-muted"
        )}
      >
        {aiToolIcon(tool.kind)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm font-medium",
              tool.exists ? "text-text-primary" : "text-text-muted"
            )}
          >
            {tool.label}
          </span>
          {tool.exists && (
            <CheckCircle2 className="h-3.5 w-3.5 text-accent-green" />
          )}
        </div>
        <div className="truncate font-mono text-[11px] text-text-muted" title={tool.path}>
          {tool.path.replace(/^.*\/(\.[^/]+\/skills)$/, "~/$1")}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {tool.exists ? (
          <>
            <div className="text-sm font-semibold text-text-primary tabular-nums">
              {tool.skillCount}
            </div>
            <button
              type="button"
              onClick={() => onOpen(tool.path)}
              className="text-[10px] text-text-muted hover:text-accent-blue"
            >
              {t("home.detectedTools.openFolder")}
            </button>
          </>
        ) : (
          <span className="text-[11px] text-text-muted">
            {t("home.detectedTools.notInstalled")}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Tauri's native `drag-drop` event payload. Tauri 2.x emits this when the user
 * drops files anywhere on a window that has `dragDropEnabled: true` (the
 * default). The payload shape is `{ type: "over" | "drop" | "leave", paths, ... }`.
 */
interface TauriDragDropPayload {
  type: "over" | "drop" | "leave" | "enter";
  paths?: string[];
}

export const HomeView: React.FC = () => {
  const { t } = useTranslation();
  const { setCurrentView } = useAppStore();
  const { libraryPath } = useSettingsStore();

  const [importDialogOpen, setImportDialogOpen] = React.useState(false);
  // M2-5 (deep): The "examples" tab merged into the new unified "discover"
  // panel, so the Home cards either pre-select Local (folder import) or
  // Discover (search Anthropic examples + MCP registries).
  const [importDefaultSource, setImportDefaultSource] = React.useState<
    "local" | "discover"
  >("local");
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);

  // Drop zone state for the in-Home drag target (separate from the global
  // QuickInstallSheet listener that lives in App.tsx)
  const [isDragHover, setIsDragHover] = React.useState(false);

  const { data: skills = [] } = useSkills();
  const { data: detected = [] } = useDetectAiTools();
  const { data: allInstallations = [] } = useAllSkillInstallations();
  const { data: appSettings } = useLoadAppSettings();
  const showInFolder = useShowInFolder();
  const rescanMutation = useRescanLibrary();
  const installMutation = useInstallSkillToTool();

  // ────────────────────────────────────────────────────────────────────────
  // Smart suggestion: detect "orphan" skills — skills the user has in their
  // library but hasn't installed into any AI tool yet. Surfaces a single
  // batch-install card so the user can plug them all in at once instead of
  // clicking each card's install badge.
  // ────────────────────────────────────────────────────────────────────────
  const orphanSkills = React.useMemo(() => {
    const installedSkillIds = new Set(allInstallations.map((i) => i.skillId));
    return skills.filter((s) => !installedSkillIds.has(s.skillId));
  }, [skills, allInstallations]);

  // We only suggest the batch install when (a) the user has saved auto-
  // install preferences from the QuickInstallSheet (so we know which tools
  // they want) AND (b) at least one of those tools is currently detected.
  const suggestedTargets = React.useMemo<InstallTargetKind[]>(() => {
    const saved = (appSettings?.autoInstallTargets ?? []) as InstallTargetKind[];
    const detectedKinds = new Set(
      detected.filter((d) => d.exists).map((d) => d.kind as InstallTargetKind)
    );
    return saved.filter((k) => detectedKinds.has(k));
  }, [appSettings?.autoInstallTargets, detected]);

  const [isBatchInstalling, setIsBatchInstalling] = React.useState(false);

  const handleBatchInstallOrphans = async () => {
    if (orphanSkills.length === 0 || suggestedTargets.length === 0) return;
    setIsBatchInstalling(true);
    let installedCount = 0;
    let failedCount = 0;

    for (const skill of orphanSkills) {
      for (const target of suggestedTargets) {
        try {
          await installMutation.mutateAsync({
            skillId: skill.skillId,
            targetKind: target,
          });
          installedCount++;
        } catch (e) {
          failedCount++;
        }
      }
    }

    setIsBatchInstalling(false);
    if (installedCount > 0) {
      toast.success(
        t("home.suggestion.installedToast", { count: installedCount }),
        failedCount > 0
          ? t("home.suggestion.partialFailed", { count: failedCount })
          : undefined
      );
    } else if (failedCount > 0) {
      toast.error(t("home.suggestion.allFailedToast"));
    }
  };

  const showOrphanSuggestion =
    orphanSkills.length >= 1 && suggestedTargets.length > 0;

  // ────────────────────────────────────────────────────────────────────────
  // Updates: parallel check across every skill with a sourceUrl. We don't
  // poll on mount — the user controls the kick-off via the Check Updates
  // button. Results are cached in this view's state and survive view
  // switches because the React Query mutation keeps `data` after success.
  // ────────────────────────────────────────────────────────────────────────
  const checkUpdates = useCheckAllSkillUpdates();
  const updateSkill = useUpdateSkillFromUrl();
  const skillUpdatesCache = useAppStore((s) => s.skillUpdates);
  const setSkillUpdatesCache = useAppStore((s) => s.setSkillUpdates);
  const markUpdateApplied = useAppStore((s) => s.markUpdateApplied);
  const appliedUpdateHashes = useAppStore((s) => s.appliedUpdateHashes);
  const [updatesExpanded, setUpdatesExpanded] = React.useState(false);
  const [updatingHashes, setUpdatingHashes] = React.useState<Set<string>>(
    new Set()
  );

  const skillsWithSource = React.useMemo(
    () => skills.filter((s) => s.sourceUrl && s.isDownloaded),
    [skills]
  );

  const availableUpdates: SkillUpdateInfo[] = React.useMemo(() => {
    if (!skillUpdatesCache) return [];
    const applied = new Set(appliedUpdateHashes);
    // Cross-check against the live skills list so entries for skills the
    // user deleted between checking-and-applying don't show up as dead
    // links in the banner. We match by hash because that's what the cache
    // entry carries; applying an update changes the hash, but by then
    // we've already added it to `applied`.
    const liveHashes = new Set(skills.map((s) => s.hash));
    return skillUpdatesCache.filter(
      (u) =>
        u.hasUpdate && !applied.has(u.skillHash) && liveHashes.has(u.skillHash)
    );
  }, [skillUpdatesCache, appliedUpdateHashes, skills]);

  const handleCheckUpdates = async () => {
    if (skillsWithSource.length === 0) {
      toast.info(t("home.updates.noSourceSkills"));
      return;
    }
    try {
      const results = await checkUpdates.mutateAsync();
      // Persist the result into the global store so it survives view
      // switches; this is what makes the banner sticky across navigation.
      setSkillUpdatesCache(results, new Date().toISOString());
      const updates = results.filter((u) => u.hasUpdate);
      if (updates.length === 0) {
        toast.success(t("home.updates.allUpToDate"));
      } else {
        toast.info(
          t("home.updates.foundToast", { count: updates.length }),
          t("home.updates.expandHint")
        );
        setUpdatesExpanded(true);
      }
    } catch (err) {
      toast.error(
        t("home.updates.checkFailed"),
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const handleApplyOne = async (update: SkillUpdateInfo) => {
    setUpdatingHashes((prev) => new Set(prev).add(update.skillHash));
    try {
      await updateSkill.mutateAsync({
        currentHash: update.skillHash,
        sourceUrl: update.sourceUrl,
      });
      markUpdateApplied(update.skillHash);
      toast.success(
        t("home.updates.updatedToast", { name: update.skillName })
      );
    } catch (err) {
      toast.error(
        t("home.updates.updateFailed", { name: update.skillName }),
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setUpdatingHashes((prev) => {
        const next = new Set(prev);
        next.delete(update.skillHash);
        return next;
      });
    }
  };

  const handleApplyAll = async () => {
    for (const u of availableUpdates) {
      await handleApplyOne(u);
    }
  };

  // 5 most recently added (or rather, most recently updated) skills.
  const recentSkills = React.useMemo(() => {
    return [...skills]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, 5);
  }, [skills]);

  const openImport = (source: "local" | "discover") => {
    setImportDefaultSource(source);
    setImportDialogOpen(true);
  };

  // We don't actually import here — the global `QuickInstallSheet` (mounted
  // in App.tsx) handles every drop on the window. Home only listens to
  // `over` / `leave` events so we can light up the inline drop-zone card and
  // tell the user "yes, this is going to work".
  React.useEffect(() => {
    let unlistens: UnlistenFn[] = [];
    (async () => {
      unlistens.push(
        await listen<TauriDragDropPayload>("tauri://drag-drop", (e) => {
          if (e.payload?.type === "drop" || e.payload?.type === "leave") {
            setIsDragHover(false);
          }
        })
      );
      unlistens.push(
        await listen("tauri://drag-enter", () => setIsDragHover(true))
      );
      unlistens.push(
        await listen("tauri://drag-leave", () => setIsDragHover(false))
      );
    })();
    return () => {
      unlistens.forEach((u) => u());
    };
  }, []);

  // Format library path for display: collapse $HOME to ~.
  const displayLibraryPath = React.useMemo(() => {
    if (!libraryPath) return t("common.notSet");
    return libraryPath.replace(/^\/Users\/[^/]+/, "~");
  }, [libraryPath, t]);

  return (
    <ScrollArea className="h-full">
      {/* `min-w-0` is critical here: the outer ScrollArea is a flex child and
          without it grid/flex children inside can grow past the container,
          pushing the entire view into horizontal overflow when a single skill
          has a very long description / source URL. */}
      <div className="mx-auto min-w-0 max-w-5xl space-y-10 px-8 py-10">
        {/* Hero */}
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
            {t("home.tagline")}
          </h1>
          <p className="max-w-2xl text-sm text-text-secondary">
            {t("home.subtitle")}
          </p>
        </header>

        {/* Quick action grid */}
        <Section title={t("home.quickActions")} titleSize="sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))]">
            <QuickActionCard
              icon={<UploadCloud className="h-5 w-5" />}
              title={t("home.actions.importLocal")}
              description={t("home.actions.importLocalDesc")}
              onClick={() => openImport("local")}
              accent="blue"
            />
            <QuickActionCard
              icon={<Sparkles className="h-5 w-5" />}
              title={t("home.actions.browseExamples")}
              description={t("home.actions.browseExamplesDesc")}
              onClick={() => openImport("discover")}
              accent="purple"
            />
            <QuickActionCard
              icon={<Plus className="h-5 w-5" />}
              title={t("home.actions.createNew")}
              description={t("home.actions.createNewDesc")}
              onClick={() => setCreateDialogOpen(true)}
              accent="green"
            />
            <div
              className={cn(
                "group relative flex h-full flex-col items-start gap-3 rounded-2xl border border-dashed p-5 text-left transition-all",
                isDragHover
                  ? "border-accent-blue bg-accent-blue/10"
                  : "border-border-default bg-bg-secondary/40 hover:border-border-hover"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl",
                  isDragHover
                    ? "bg-accent-blue text-white"
                    : "bg-bg-tertiary text-text-muted"
                )}
              >
                <UploadCloud className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-text-primary">
                  {isDragHover
                    ? t("home.actions.dropHereActive")
                    : t("home.actions.dropHere")}
                </p>
                <p className="text-sm text-text-secondary">
                  {t("home.actions.dropHereDesc")}
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* Smart suggestion banner: only renders when there's something
            actionable to surface (orphan skills + a known target list). */}
        {showOrphanSuggestion && (
          <div className="rounded-2xl border border-accent-blue/30 bg-gradient-to-br from-accent-blue/10 via-accent-blue/5 to-transparent p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-blue/20 text-accent-blue">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-text-primary">
                  {t("home.suggestion.title", {
                    count: orphanSkills.length,
                  })}
                </h3>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {t("home.suggestion.description", {
                    count: orphanSkills.length,
                    tools: suggestedTargets
                      .map(
                        (k) =>
                          detected.find((d) => d.kind === k)?.label ?? k
                      )
                      .join(" + "),
                  })}
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleBatchInstallOrphans}
                disabled={isBatchInstalling}
              >
                {isBatchInstalling ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t("home.suggestion.action")}
              </Button>
            </div>
          </div>
        )}

        {/* Updates available — only rendered after the user has clicked
            "Check updates" and we found at least one new version. */}
        {availableUpdates.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-accent-yellow/30 bg-gradient-to-br from-accent-yellow/10 via-accent-yellow/5 to-transparent">
            <button
              type="button"
              onClick={() => setUpdatesExpanded((v) => !v)}
              className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-accent-yellow/5"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-yellow/20 text-accent-yellow">
                <Download className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-text-primary">
                  {t("home.updates.title", {
                    count: availableUpdates.length,
                  })}
                </h3>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {availableUpdates
                    .slice(0, 3)
                    .map((u) => u.skillName)
                    .join(", ")}
                  {availableUpdates.length > 3 &&
                    t("home.updates.moreSuffix", {
                      count: availableUpdates.length - 3,
                    })}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleApplyAll();
                }}
                disabled={updatingHashes.size > 0}
              >
                {updatingHashes.size > 0 ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t("home.updates.updateAll")}
              </Button>
              {updatesExpanded ? (
                <ChevronUp className="h-4 w-4 text-text-muted" />
              ) : (
                <ChevronDown className="h-4 w-4 text-text-muted" />
              )}
            </button>

            {updatesExpanded && (
              <div className="space-y-2 border-t border-accent-yellow/20 bg-bg-secondary/30 px-5 py-3">
                {availableUpdates.map((u) => {
                  const isUpdating = updatingHashes.has(u.skillHash);
                  return (
                    <div
                      key={u.skillHash}
                      className="flex min-w-0 items-center gap-3 rounded-lg bg-bg-secondary px-3 py-2"
                    >
                      <Layers className="h-4 w-4 shrink-0 text-text-muted" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">
                          {u.skillName}
                        </div>
                        <div className="truncate text-[10px] text-text-muted" title={u.sourceUrl}>
                          {u.sourceUrl}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleApplyOne(u)}
                        disabled={isUpdating}
                      >
                        {isUpdating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Detected AI tools. `minmax(0, 1fr)` keeps long install paths from
            pushing the page into horizontal overflow on narrow windows. */}
        {detected.length > 0 && (
          <Section
            title={t("home.detectedTools.title")}
            description={t("home.detectedTools.subtitle")}
            titleSize="sm"
          >
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[repeat(2,minmax(0,1fr))]">
              {detected.map((tool) => (
                <DetectedToolCard
                  key={tool.kind}
                  tool={tool}
                  onOpen={(p) => showInFolder.mutate(p)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Library card + Recent skills, two-column on wide screens.
            `minmax(0, *fr)` (instead of plain `1fr`) tells grid that columns
            may shrink to zero; without it, an unusually long string inside a
            child can blow the column past its fr share and force horizontal
            page scroll. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          {/* Library summary */}
          <Section title={t("home.library.title")} titleSize="sm" className="min-w-0">
            <div className="rounded-2xl border border-border-default bg-bg-secondary p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-blue/10 text-accent-blue">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold text-text-primary tabular-nums">
                    {t("home.library.totalSkills", { count: skills.length })}
                  </div>
                  <div className="text-xs text-text-muted">
                    {t("home.library.path")}
                  </div>
                </div>
              </div>
              <div
                className="mt-3 truncate rounded-lg bg-bg-tertiary px-3 py-2 font-mono text-xs text-text-secondary"
                title={libraryPath}
              >
                {displayLibraryPath}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => libraryPath && showInFolder.mutate(libraryPath)}
                  disabled={!libraryPath}
                >
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  {t("home.library.openInFinder")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => rescanMutation.mutate()}
                  disabled={rescanMutation.isPending || !libraryPath}
                  title={t("home.library.rescan")}
                >
                  {rescanMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleCheckUpdates()}
                  disabled={
                    checkUpdates.isPending || skillsWithSource.length === 0
                  }
                  title={t("home.library.checkUpdates")}
                >
                  {checkUpdates.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </Section>

          {/* Recent skills */}
          <Section
            title={t("home.recentSkills.title")}
            titleSize="sm"
            className="min-w-0"
            actions={
              skills.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentView("library")}
                >
                  {t("home.recentSkills.viewAll")}
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              ) : undefined
            }
          >
            {recentSkills.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-default bg-bg-secondary/40 px-5 py-8 text-center text-sm text-text-muted">
                {t("home.recentSkills.empty")}
              </div>
            ) : (
              <div className="space-y-2">
                {recentSkills.map((s) => (
                  <RecentSkillRow key={s.hash} skill={s} />
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* Dialogs hosted here so they survive view switches */}
      <ImportSkillDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        defaultSource={importDefaultSource}
      />
      <CreateSkillDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </ScrollArea>
  );
};

interface RecentSkillRowProps {
  skill: Skill;
}

const RecentSkillRow: React.FC<RecentSkillRowProps> = ({ skill }) => {
  const { setSelectedSkillHash, setCurrentView } = useAppStore();
  return (
    <button
      type="button"
      onClick={() => {
        setSelectedSkillHash(skill.hash);
        setCurrentView("library");
      }}
      className="flex w-full items-center gap-3 rounded-xl border border-border-default bg-bg-secondary p-3 text-left transition-colors hover:border-border-hover hover:bg-bg-tertiary"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-tertiary text-text-muted">
        <Layers className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-primary">
          {skill.name}
        </div>
        <div className="truncate text-xs text-text-muted">
          {skill.description}
        </div>
      </div>
      <div className="shrink-0">
        {skill.skillId && <SkillInstallBadges skillId={skill.skillId} compact />}
      </div>
    </button>
  );
};
