import React from "react";
import { Download, ExternalLink, Shield, Tag, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import { Badge, Switch } from "@/components/ui";
import type { Skill } from "@/types";
import { getPermissionLevel } from "@/types";

interface SkillCardProps {
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

export const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  isVisible = true,
  onVisibilityChange,
  selectionMode = false,
  isSelected: isSelectedForBatch = false,
  onToggleSelection,
  isQuarantined = false,
}) => {
  const { setSelectedSkillHash, selectedSkillHash } = useAppStore();

  const isSelected = selectedSkillHash === skill.hash;
  
  // Check for high-risk permissions
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
        "group relative cursor-pointer rounded-lg border bg-bg-secondary transition-all hover:shadow-md",
        selectionMode && isSelectedForBatch
          ? "border-accent-blue shadow-md ring-2 ring-accent-blue/30"
          : isSelected
          ? "border-accent-blue shadow-md ring-1 ring-accent-blue/20"
          : "border-border-default hover:border-border-default/80"
      )}
      onClick={handleClick}
    >
      {/* Header with gradient accent */}
      <div className={cn(
        "h-1 rounded-t-lg",
        isQuarantined
          ? "bg-gradient-to-r from-accent-yellow/80 to-accent-yellow/20"
          : hasHighRisk 
          ? "bg-gradient-to-r from-permission-high/60 to-permission-high/20"
          : skill.isDownloaded
          ? "bg-gradient-to-r from-accent-blue/60 to-accent-blue/20"
          : "bg-gradient-to-r from-accent-green/60 to-accent-green/20"
      )} />

      <div className="p-4">
        {/* Header: Switch + Name + Version */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
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
                  onCheckedChange={(checked) => {
                    onVisibilityChange(checked);
                  }}
                />
              </div>
            ) : null}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-text-primary truncate">
                {skill.name}
              </h3>
              {skill.author && (
                <p className="text-[10px] text-text-muted truncate">
                  by {skill.author}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isQuarantined && (
              <ShieldAlert className="h-3.5 w-3.5 text-accent-yellow" />
            )}
            <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-bg-tertiary">
              v{skill.version}
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="mt-2.5 text-xs text-text-secondary line-clamp-2 leading-relaxed">
          {skill.description || "No description available"}
        </p>

        {/* Tags */}
        {skill.tags.length > 0 && (
          <div className="mt-2.5 flex items-center gap-1">
            <Tag className="h-3 w-3 text-text-muted shrink-0" />
            <div className="flex flex-wrap gap-1 overflow-hidden">
              {skill.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-bg-tertiary"
                >
                  {tag}
                </span>
              ))}
              {skill.tags.length > 3 && (
                <span className="text-[10px] text-text-muted">
                  +{skill.tags.length - 3}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer: Permissions + Indicators */}
        <div className="mt-3 pt-3 border-t border-border-muted flex items-center justify-between">
          <div className="flex items-center gap-1">
            {skill.permissions.length > 0 ? (
              <>
                <Shield className="h-3 w-3 text-text-muted shrink-0" />
                <div className="flex gap-1">
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
                </div>
              </>
            ) : (
              <span className="text-[10px] text-text-muted">No permissions</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {skill.isDownloaded && (
              <Download className="h-3 w-3 text-accent-blue" />
            )}
            {skill.sourceUrl && (
              <ExternalLink className="h-3 w-3 text-text-muted" />
            )}
            {skill.parameters.length > 0 && (
              <span className="text-[10px] text-text-muted">
                {skill.parameters.length}p
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
