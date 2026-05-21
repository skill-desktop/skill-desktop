import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui";
import {
  useAllSkillInstallations,
  useDetectAiTools,
  useInstallSkillToTool,
  useUninstallSkillFromTool,
  type InstallTargetKind,
  type SkillInstallation,
} from "@/hooks";

interface SkillInstallBadgesProps {
  skillId: string;
  /**
   * Stop click propagation up to the parent card. The cards themselves are
   * clickable (they open the detail panel), so without this every badge click
   * would also pop the panel open.
   */
  stopPropagation?: boolean;
  /** Compact mode for list / dense grids — uses smaller icons. */
  compact?: boolean;
}

/**
 * Tiny per-AI-tool "install badge" strip we draw on every SkillCard. Each
 * badge is a 1-letter circle: filled when the skill is symlinked into that
 * tool's `~/.X/skills/` directory, hollow when it isn't. Clicking toggles the
 * install state without going through the full InstallSkillDialog — that
 * dialog is still reachable via the right-click menu for custom paths.
 *
 * We deliberately keep this read-mostly: badges only render for tools that
 * `detect_ai_tools` reports as locally present, plus the "Agent Skills
 * standard" (`~/.agents/skills/`) which is the cross-tool target.
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

  // Find which (kind) targets this skill is currently installed to.
  const installedByKind = React.useMemo(() => {
    const map = new Map<InstallTargetKind, SkillInstallation>();
    for (const i of allInstallations) {
      if (i.skillId === skillId) map.set(i.targetKind, i);
    }
    return map;
  }, [allInstallations, skillId]);

  // Only render badges for tools the user actually has. If nothing is
  // detected (very fresh machine) we still surface the Agent Skills standard
  // so the user has something to click; otherwise the strip would be empty
  // and the card would look unfinished.
  const tools = React.useMemo(() => {
    const visible = detected.filter(
      (d) => d.exists || d.kind === "agents"
    );
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
    const existing = installedByKind.get(kind);
    const toolLabel = tools.find((tt) => tt.kind === kind)?.label ?? kind;
    try {
      if (existing) {
        await uninstallMutation.mutateAsync({
          skillId,
          linkedPath: existing.linkedPath,
          targetPath: existing.targetPath,
        });
        toast.success(
          t("skillCard.toast.uninstalled", { tool: toolLabel })
        );
      } else {
        await installMutation.mutateAsync({
          skillId,
          targetKind: kind,
        });
        toast.success(
          t("skillCard.toast.installed", { tool: toolLabel })
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(
        existing
          ? t("skillCard.toast.uninstallFailed", { tool: toolLabel })
          : t("skillCard.toast.installFailed", { tool: toolLabel }),
        message
      );
    }
  };

  const dotSize = compact ? "h-4 w-4 text-[9px]" : "h-[18px] w-[18px] text-[10px]";

  return (
    <div
      className={cn(
        "flex items-center gap-1",
        stopPropagation && "pointer-events-auto"
      )}
    >
      {tools.map((tool) => {
        const installed = installedByKind.has(tool.kind);
        // First non-whitespace character of the label, uppercased. Gives us
        // a stable, recognisable glyph per tool (C for Claude / Cursor /
        // Codex — yes, collisions, but the colour/tooltip disambiguate).
        const glyph = (tool.label.match(/[A-Za-z]/)?.[0] || "?").toUpperCase();
        return (
          <button
            type="button"
            key={tool.kind}
            onClick={(e) => handleToggle(e, tool.kind)}
            title={
              installed
                ? t("skillCard.installedIn", { tool: tool.label })
                : t("skillCard.notInstalledIn", { tool: tool.label })
            }
            className={cn(
              "flex items-center justify-center rounded-full font-semibold tabular-nums transition-all",
              dotSize,
              installed
                ? "bg-accent-blue text-white shadow-sm hover:scale-110"
                : "border border-border-default bg-bg-tertiary text-text-muted hover:border-accent-blue hover:text-text-primary"
            )}
            disabled={installMutation.isPending || uninstallMutation.isPending}
            aria-label={
              installed
                ? t("skillCard.installedIn", { tool: tool.label })
                : t("skillCard.notInstalledIn", { tool: tool.label })
            }
          >
            {glyph}
          </button>
        );
      })}
    </div>
  );
};
