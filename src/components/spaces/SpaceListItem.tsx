import React from "react";
import { useTranslation } from "react-i18next";
import { Badge, SideNavItem } from "@/components/ui";
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

  // Match backend `get_visible_skills`: missing entries default to visible.
  // Counting only entries that were *explicitly* hidden gives us the same
  // total as the backend exposes to other consumers.
  const explicitlyHidden = Object.values(visibilityMap).filter((v) => v === false).length;
  const visibleCount = Math.max(0, totalSkills - explicitlyHidden);

  return (
    <SideNavItem
      label={space.name}
      meta={`${visibleCount} / ${totalSkills} ${t("common.skills")}`}
      trailing={
        space.isDefault ? (
          <Badge variant="blue" className="text-[10px]">
            {t("common.default")}
          </Badge>
        ) : null
      }
      active={isSelected}
      onClick={onSelect}
    />
  );
};
