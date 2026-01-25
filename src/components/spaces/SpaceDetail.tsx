import React from "react";
import { useTranslation } from "react-i18next";
import { Settings2, Trash2, FolderOpen, CopyPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import type { Space } from "@/types";

interface SpaceDetailProps {
  space: Space;
  visibleSkillCount: number;
  totalSkills: number;
  // Actions
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
  onManageSkills: () => void;
}

export const SpaceDetail: React.FC<SpaceDetailProps> = ({
  space,
  visibleSkillCount,
  totalSkills,
  onEdit,
  onClone,
  onDelete,
  onManageSkills,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 p-6">
      <div className="max-w-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">
              {space.name}
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              {space.description || t("spaces.noDescription")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Settings2 className="h-3.5 w-3.5 mr-1.5" />
              {t("common.edit")}
            </Button>
            <Button variant="secondary" size="sm" onClick={onClone}>
              <CopyPlus className="h-3.5 w-3.5 mr-1.5" />
              {t("common.clone")}
            </Button>
            {!space.isDefault && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-accent-red"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-lg border border-border-default bg-bg-secondary p-4">
            <div className="text-2xl font-bold text-text-primary">
              {visibleSkillCount}
            </div>
            <div className="text-xs text-text-muted">
              {t("spaces.info.activeSkills")} {totalSkills > 0 && `/ ${totalSkills} ${t("common.total")}`}
            </div>
          </div>
          <div className="rounded-lg border border-border-default bg-bg-secondary p-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-text-muted" />
              <span className="text-sm text-text-primary truncate">
                {space.activeDirPath || t("common.notSet")}
              </span>
            </div>
            <div className="text-xs text-text-muted mt-1">
              {t("spaces.info.activeDirectory")}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={onManageSkills}
            disabled={totalSkills === 0}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("spaces.actions.manageSkills")} ({visibleSkillCount}/{totalSkills})
          </Button>
        </div>
      </div>
    </div>
  );
};
