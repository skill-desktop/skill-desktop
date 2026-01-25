import React from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { useSkillVisibilityMap } from "@/hooks";
import type { Space } from "@/types";

interface SpaceListItemProps {
  space: Space;
  isSelected: boolean;
  totalSkills: number;
  onSelect: () => void;
}

export const SpaceListItem: React.FC<SpaceListItemProps> = ({
  space,
  isSelected,
  totalSkills,
  onSelect,
}) => {
  const { t } = useTranslation();
  const { data: visibilityMap = {} } = useSkillVisibilityMap(space.id);
  
  // If no visibility map exists, all skills are visible by default
  const visibleCount = Object.keys(visibilityMap).length > 0
    ? Object.values(visibilityMap).filter(Boolean).length
    : totalSkills;

  return (
    <button
      className={cn(
        "flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-bg-tertiary",
        isSelected && "bg-bg-tertiary"
      )}
      onClick={onSelect}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">
            {space.name}
          </span>
          {space.isDefault && (
            <Badge variant="blue" className="text-[10px]">
              {t("common.default")}
            </Badge>
          )}
        </div>
        <span className="text-xs text-text-muted">
          {visibleCount} / {totalSkills} {t("common.skills")}
        </span>
      </div>
      {isSelected && (
        <Check className="h-4 w-4 text-accent-blue shrink-0" />
      )}
    </button>
  );
};
