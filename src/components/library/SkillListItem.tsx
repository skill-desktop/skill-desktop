import React from "react";
import { Download, ExternalLink, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import { Badge, Switch } from "@/components/ui";
import type { Skill } from "@/types";
import { getPermissionLevel } from "@/types";

interface SkillListItemProps {
  skill: Skill;
  isVisible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

export const SkillListItem: React.FC<SkillListItemProps> = ({
  skill,
  isVisible = true,
  onVisibilityChange,
}) => {
  const { setSelectedSkillHash, selectedSkillHash } = useAppStore();

  const isSelected = selectedSkillHash === skill.hash;
  const hasHighRisk = skill.permissions.some(p => getPermissionLevel(p) === "high");

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-bg-tertiary border-l-2",
        isSelected 
          ? "bg-bg-tertiary border-l-accent-blue" 
          : hasHighRisk
          ? "border-l-permission-high/50"
          : "border-l-transparent"
      )}
      onClick={() => setSelectedSkillHash(skill.hash)}
    >
      {/* Visibility toggle */}
      {onVisibilityChange && (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={isVisible}
            onCheckedChange={(checked) => {
              onVisibilityChange(checked);
            }}
          />
        </div>
      )}

      {/* Risk indicator */}
      <div className={cn(
        "w-2 h-2 rounded-full shrink-0",
        hasHighRisk 
          ? "bg-permission-high"
          : skill.permissions.some(p => getPermissionLevel(p) === "medium")
          ? "bg-permission-medium"
          : skill.permissions.length > 0
          ? "bg-permission-low"
          : "bg-text-muted/30"
      )} />

      {/* Name and author */}
      <div className="w-44 min-w-0">
        <span className="text-sm font-medium text-text-primary truncate block">
          {skill.name}
        </span>
        {skill.author && (
          <span className="text-[10px] text-text-muted truncate block">
            {skill.author}
          </span>
        )}
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-text-secondary truncate block">
          {skill.description || "No description"}
        </span>
      </div>

      {/* Tags (first 2) */}
      <div className="flex items-center gap-1 shrink-0 w-32">
        {skill.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-bg-tertiary truncate"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Permissions */}
      <div className="flex items-center gap-1 shrink-0 w-36">
        <Shield className="h-3 w-3 text-text-muted shrink-0" />
        {skill.permissions.length > 0 ? (
          <>
            {skill.permissions.slice(0, 2).map((permission) => (
              <Badge
                key={permission}
                variant={getPermissionLevel(permission)}
                className="text-[9px] px-1.5 py-0"
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
          <span className="text-[10px] text-text-muted">None</span>
        )}
      </div>

      {/* Indicators */}
      <div className="flex items-center gap-2 shrink-0 w-12 justify-end">
        {skill.isDownloaded && (
          <Download className="h-3 w-3 text-accent-blue" />
        )}
        {skill.sourceUrl && (
          <ExternalLink className="h-3 w-3 text-text-muted" />
        )}
      </div>

      {/* Version */}
      <span className="text-[10px] text-text-muted w-14 text-right shrink-0 px-1.5 py-0.5 rounded bg-bg-tertiary">
        v{skill.version}
      </span>
    </div>
  );
};
