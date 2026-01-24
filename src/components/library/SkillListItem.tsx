import React from "react";
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

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-bg-tertiary",
        isSelected && "bg-bg-tertiary"
      )}
      onClick={() => setSelectedSkillHash(skill.hash)}
    >
      {/* Visibility toggle */}
      {onVisibilityChange && (
        <Switch
          checked={isVisible}
          onCheckedChange={(checked) => {
            onVisibilityChange(checked);
          }}
        />
      )}

      {/* Name */}
      <div className="w-40 min-w-0">
        <span className="text-sm font-medium text-text-primary truncate block">
          {skill.name}
        </span>
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-text-secondary truncate block">
          {skill.description || "No description"}
        </span>
      </div>

      {/* Permissions */}
      <div className="flex items-center gap-1 shrink-0">
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

      {/* Version */}
      <span className="text-xs text-text-muted w-16 text-right shrink-0">
        v{skill.version}
      </span>
    </div>
  );
};
