import React from "react";
import { useTranslation } from "react-i18next";
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
      className={`w-full px-3 py-2 text-left text-sm transition-colors ${
        isSelected
          ? "bg-bg-tertiary text-text-primary border-l-2 border-accent-blue"
          : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary border-l-2 border-transparent"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium truncate flex-1">
          {space.name}
        </span>
        {space.isDefault && (
          <Badge variant="blue" className="text-[10px]">
            {t("common.default")}
          </Badge>
        )}
      </div>
      <div className="text-xs text-text-muted">
        {visibleCount} / {totalSkills} {t("common.skills")}
      </div>
    </button>
  );
};
