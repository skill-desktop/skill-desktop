import React from "react";
import { Download, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import { Badge, Switch } from "@/components/ui";
import type { Skill } from "@/types";
import { getPermissionLevel } from "@/types";

interface SkillCardProps {
  skill: Skill;
  isVisible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

export const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  isVisible = true,
  onVisibilityChange,
}) => {
  const { setSelectedSkillHash, selectedSkillHash } = useAppStore();

  const isSelected = selectedSkillHash === skill.hash;

  return (
    <div
      className={cn(
        "group relative cursor-pointer rounded-lg border bg-bg-secondary p-4 transition-all hover:border-border-default/80 hover:shadow-md",
        isSelected
          ? "border-accent-blue shadow-md"
          : "border-border-default"
      )}
      onClick={() => setSelectedSkillHash(skill.hash)}
    >
      {/* Header: Switch + Name + Version */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          {onVisibilityChange && (
            <Switch
              checked={isVisible}
              onCheckedChange={(checked) => {
                onVisibilityChange(checked);
              }}
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-text-primary truncate">
              {skill.name}
            </h3>
          </div>
        </div>
        <span className="text-xs text-text-muted shrink-0">v{skill.version}</span>
      </div>

      {/* Description */}
      <p className="mt-2 text-xs text-text-secondary line-clamp-2">
        {skill.description || "No description available"}
      </p>

      {/* Footer: Tags + Downloaded indicator */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {skill.permissions.slice(0, 2).map((permission) => (
            <Badge
              key={permission}
              variant={getPermissionLevel(permission)}
              className="text-[10px]"
            >
              {permission}
            </Badge>
          ))}
          {skill.permissions.length > 2 && (
            <Badge variant="secondary" className="text-[10px]">
              +{skill.permissions.length - 2}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {skill.isDownloaded && (
            <div className="flex items-center gap-1 text-text-muted">
              <Download className="h-3 w-3" />
              <span className="text-[10px]">Downloaded</span>
            </div>
          )}
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-bg-tertiary"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Show context menu
            }}
          >
            <MoreVertical className="h-3.5 w-3.5 text-text-muted" />
          </button>
        </div>
      </div>
    </div>
  );
};
