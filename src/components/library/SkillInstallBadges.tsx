import React from "react";
import { useTranslation } from "react-i18next";
import { Bot, Zap, Code2, Sparkles, TerminalSquare, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui";
import {
  useAllSkillInstallations,
  useDetectAiTools,
  useInstallSkillToTool,
  useUninstallSkillFromTool,
  type InstallTargetKind,
  type SkillInstallation,
  type DetectedAiTool,
} from "@/hooks";

interface SkillInstallBadgesProps {
  skillId: string;
  /**
   * Stop click propagation up to the parent card. The cards themselves are
   * clickable (they open the detail panel), so without this every badge click
   * would also pop the panel open.
   */
  stopPropagation?: boolean;
  /** Compact mode (icon-only chips) for list / dense grids. */
  compact?: boolean;
}

/**
 * Pick a recognisable icon for each known AI tool. Falls back to a generic
 * terminal icon when we don't have a special case for the `kind`. The icons
 * read better than the previous single-letter approach because two tools
 * (Claude / Cursor / Codex) share the same first letter.
 */
function toolIcon(kind: string, className?: string) {
  const cls = cn("h-3 w-3", className);
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

/**
 * A short, friendly label for a tool — drops the long parenthetical part
 * we send from Rust (`Claude Code (~/.claude/skills/)` → `Claude Code`).
 */
function shortLabel(tool: DetectedAiTool): string {
  return tool.label.replace(/\s*\(.*\)\s*$/, "").trim() || tool.label;
}

/**
 * Per-AI-tool install chips drawn on every SkillCard. Each chip toggles the
 * symlink into that tool's `~/.X/skills/` directory: filled when installed,
 * outlined when not. Compact mode (used in dense lists) shows just the icon;
 * full mode shows icon + tool name so users can tell Claude from Cursor at a
 * glance instead of decoding 1-letter circles.
 *
 * We deliberately keep this read-mostly: chips only render for tools that
 * `detect_ai_tools` reports as locally present, plus the "Agent Skills
 * standard" (~/.agents/skills/) cross-tool target.
 */
export const SkillInstallBadges: React.FC<SkillInstallBadgesProps> = ({
  skillId,
  stopPropagation = true,
  compact = false,
}) => {
  const { t } = useTranslation();
  const { data: detected = [] } = useDetectAiTools();
  const { data: allInstallations = [] } = useAllSkillInstallations();
  const installMutation = useInstallSkillToTool();
  const uninstallMutation = useUninstallSkillFromTool();
  const [pendingKind, setPendingKind] = React.useState<InstallTargetKind | null>(
    null
  );

  // Which (kind) targets this skill is currently installed to.
  const installedByKind = React.useMemo(() => {
    const map = new Map<InstallTargetKind, SkillInstallation>();
    for (const i of allInstallations) {
      if (i.skillId === skillId) map.set(i.targetKind, i);
    }
    return map;
  }, [allInstallations, skillId]);

  // Only render chips for tools the user actually has. If nothing is
  // detected (very fresh machine) we still surface the Agent Skills standard
  // so the user has something to click; otherwise the strip would be empty
  // and the card would look unfinished.
  const tools = React.useMemo(() => {
    const visible = detected.filter((d) => d.exists || d.kind === "agents");
    return visible.length > 0 ? visible : detected;
  }, [detected]);

  if (tools.length === 0) return null;

  const handleToggle = async (
    e: React.MouseEvent,
    kind: InstallTargetKind
  ) => {
    if (stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (pendingKind) return; // Guard against double-click while in-flight.

    const existing = installedByKind.get(kind);
    const toolLabel =
      tools.find((tt) => tt.kind === kind)?.label ?? String(kind);
    setPendingKind(kind);
    try {
      if (existing) {
        await uninstallMutation.mutateAsync({
          skillId,
          linkedPath: existing.linkedPath,
          targetPath: existing.targetPath,
        });
        toast.success(t("skillCard.toast.uninstalled", { tool: toolLabel }));
      } else {
        await installMutation.mutateAsync({
          skillId,
          targetKind: kind,
        });
        toast.success(t("skillCard.toast.installed", { tool: toolLabel }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(
        existing
          ? t("skillCard.toast.uninstallFailed", { tool: toolLabel })
          : t("skillCard.toast.installFailed", { tool: toolLabel }),
        message
      );
    } finally {
      setPendingKind(null);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1",
        stopPropagation && "pointer-events-auto"
      )}
    >
      {tools.map((tool) => {
        const installed = installedByKind.has(tool.kind);
        const isPending = pendingKind === tool.kind;
        const label = shortLabel(tool);
        const title = installed
          ? t("skillCard.installedIn", { tool: tool.label })
          : t("skillCard.notInstalledIn", { tool: tool.label });

        // Compact mode: pure icon chip. The icon doubles as install state
        // (filled background = installed, transparent background = not).
        if (compact) {
          return (
            <button
              type="button"
              key={tool.kind}
              onClick={(e) => handleToggle(e, tool.kind as InstallTargetKind)}
              title={title}
              aria-label={title}
              aria-pressed={installed}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md border transition-all",
                installed
                  ? "border-accent-blue bg-accent-blue text-white shadow-sm"
                  : "border-border-default bg-bg-tertiary text-text-muted hover:border-accent-blue hover:text-text-primary",
                isPending && "opacity-50"
              )}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                toolIcon(tool.kind)
              )}
            </button>
          );
        }

        // Full mode: icon + label pill. The check overlay on the icon makes
        // install state legible even when shown side-by-side with non-installed
        // chips of the same colour family.
        return (
          <button
            type="button"
            key={tool.kind}
            onClick={(e) => handleToggle(e, tool.kind as InstallTargetKind)}
            title={title}
            aria-label={title}
            aria-pressed={installed}
            disabled={isPending}
            className={cn(
              "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-all",
              installed
                ? "border-accent-blue bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20"
                : "border-border-default bg-bg-tertiary text-text-muted hover:border-accent-blue hover:text-text-primary",
              isPending && "opacity-50"
            )}
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : installed ? (
              <Check className="h-3 w-3" />
            ) : (
              toolIcon(tool.kind)
            )}
            <span className="leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  );
};
