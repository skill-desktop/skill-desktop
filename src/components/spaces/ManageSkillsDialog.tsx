import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button, ScrollArea, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui";
import type { Skill } from "@/types";

interface ManageSkillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceName: string;
  skills: Skill[];
  visibilityMap: Record<string, boolean>;
  visibleSkillCount: number;
  // Actions
  onToggleVisibility: (skillHash: string, isVisible: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  isUpdating: boolean;
}

export const ManageSkillsDialog: React.FC<ManageSkillsDialogProps> = ({
  open,
  onOpenChange,
  spaceName,
  skills,
  visibilityMap,
  visibleSkillCount,
  onToggleVisibility,
  onSelectAll,
  onDeselectAll,
  isUpdating,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("spaces.manageSkillsDialog.title", { name: spaceName })}</DialogTitle>
        </DialogHeader>

        {/* Actions */}
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={onSelectAll}
            disabled={isUpdating}
          >
            {t("common.selectAll")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onDeselectAll}
            disabled={isUpdating}
          >
            {t("common.deselectAll")}
          </Button>
          <span className="text-xs text-text-muted ml-auto">
            {t("spaces.manageSkillsDialog.selectedCount", { count: visibleSkillCount, total: skills.length })}
          </span>
        </div>

        {/* Skills list */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-2">
            {skills.map((skill) => {
              const isVisible = visibilityMap[skill.hash] ?? true;
              return (
                <div
                  key={skill.hash}
                  className={cn(
                    "flex items-center gap-3 rounded-md border p-3 transition-colors",
                    isVisible
                      ? "border-accent-blue/50 bg-accent-blue/5"
                      : "border-border-default bg-bg-tertiary"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={(e) => onToggleVisibility(skill.hash, e.target.checked)}
                    className="h-4 w-4 rounded border-border-default"
                    disabled={isUpdating}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">
                        {skill.name}
                      </span>
                      <span className="text-xs text-text-muted">v{skill.version}</span>
                    </div>
                    <p className="text-xs text-text-secondary truncate">
                      {skill.description}
                    </p>
                  </div>
                  {skill.permissions.length > 0 && (
                    <div className="flex gap-1">
                      {skill.permissions.slice(0, 2).map((p) => (
                        <Badge key={p} variant="blue" className="text-[10px]">
                          {p}
                        </Badge>
                      ))}
                      {skill.permissions.length > 2 && (
                        <Badge variant="blue" className="text-[10px]">
                          +{skill.permissions.length - 2}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            {t("common.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
