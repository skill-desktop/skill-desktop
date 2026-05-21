import React from "react";
import { useTranslation } from "react-i18next";
import { Download, ExternalLink, Shield, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import { Badge, Switch } from "@/components/ui";
import type { Skill } from "@/types";
import { getPermissionLevel } from "@/types";
import { SkillInstallBadges } from "./SkillInstallBadges";

interface SkillListItemProps {
  skill: Skill;
  isVisible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  // Selection mode props
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (hash: string) => void;
  // Quarantine props
  isQuarantined?: boolean;
}

export const SkillListItem: React.FC<SkillListItemProps> = ({
  skill,
  isVisible = true,
  onVisibilityChange,
  selectionMode = false,
  isSelected: isSelectedForBatch = false,
  onToggleSelection,
  isQuarantined = false,
}) => {
  const { t } = useTranslation();
  const { setSelectedSkillHash, selectedSkillHash } = useAppStore();

  const isSelected = selectedSkillHash === skill.hash;
  const hasHighRisk = skill.permissions.some(p => getPermissionLevel(p) === "high");

  const handleClick = () => {
    if (selectionMode && onToggleSelection) {
      onToggleSelection(skill.hash);
    } else {
      setSelectedSkillHash(skill.hash);
    }
  };

  return (
    <div
      className={cn(
        "flex cursor-pointer items-center gap-4 border-l-2 px-4 py-3 transition-colors hover:bg-bg-tertiary",
        selectionMode && isSelectedForBatch
          ? "border-l-accent-blue bg-accent-blue/10"
          : isSelected
          ? "border-l-accent-blue bg-bg-tertiary"
          : isQuarantined
          ? "border-l-accent-yellow/70"
          : hasHighRisk
          ? "border-l-permission-high/50"
          : "border-l-transparent"
      )}
      onClick={handleClick}
    >
      {selectionMode ? (
        <div onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelectedForBatch}
            onChange={() => onToggleSelection?.(skill.hash)}
            className="h-4 w-4 rounded border-border-default"
          />
        </div>
      ) : onVisibilityChange ? (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={isVisible}
            onCheckedChange={(checked) => onVisibilityChange(checked)}
          />
        </div>
      ) : null}

      {isQuarantined ? (
        <ShieldAlert
          className="h-4 w-4 shrink-0 text-accent-yellow"
          aria-label="quarantined"
        />
      ) : (
        <div
          aria-hidden
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            hasHighRisk
              ? "bg-permission-high"
              : skill.permissions.some((p) => getPermissionLevel(p) === "medium")
              ? "bg-permission-medium"
              : skill.permissions.length > 0
              ? "bg-permission-low"
              : "bg-text-muted/30"
          )}
        />
      )}

      <div className="w-44 min-w-0">
        <span className="block truncate text-sm font-medium text-text-primary">
          {skill.name}
        </span>
        {skill.author && (
          <span className="block truncate text-xs text-text-muted">
            {skill.author}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs text-text-secondary">
          {skill.description || t("skillCard.noDescription")}
        </span>
      </div>

      <div className="flex w-32 shrink-0 items-center gap-1">
        {skill.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="truncate rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex w-36 shrink-0 items-center gap-1">
        <Shield className="h-3 w-3 shrink-0 text-text-muted" />
        {skill.permissions.length > 0 ? (
          <>
            {skill.permissions.slice(0, 2).map((permission) => (
              <Badge
                key={permission}
                variant={getPermissionLevel(permission)}
                className="px-1.5 py-0 text-[10px]"
              >
                {permission}
              </Badge>
            ))}
            {skill.permissions.length > 2 && (
              <span className="text-[10px] text-text-muted">
                +{skill.permissions.length - 2}
              </span>
            )}
          </>
        ) : (
          <span className="text-[10px] text-text-muted">0</span>
        )}
      </div>

      {skill.skillId && (
        <div className="w-24 shrink-0">
          <SkillInstallBadges skillId={skill.skillId} compact />
        </div>
      )}

      <div className="flex w-12 shrink-0 items-center justify-end gap-2 text-text-muted">
        {skill.isDownloaded && (
          <Download className="h-3 w-3 text-accent-blue" />
        )}
        {skill.sourceUrl && <ExternalLink className="h-3 w-3" />}
      </div>

      <span className="w-14 shrink-0 rounded bg-bg-tertiary px-1.5 py-0.5 text-right font-mono text-[10px] text-text-muted">
        v{skill.version}
      </span>
    </div>
  );
};
