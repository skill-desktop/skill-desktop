import React from "react";
import { useTranslation } from "react-i18next";
import { Settings2, Trash2, FolderOpen, CopyPlus, Plus, RefreshCw, Loader2 } from "lucide-react";
import { Button, Alert } from "@/components/ui";
import {
  useSyncSpace,
  useSkillVisibilityMap,
  useSkills,
  useShowInFolder,
} from "@/hooks";
import { useSettingsStore } from "@/stores";
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
  const syncSpaceMutation = useSyncSpace();
  const { data: skills = [] } = useSkills();
  const { data: visibilityMap = {} } = useSkillVisibilityMap(space.id);
  const { libraryPath } = useSettingsStore();
  const showInFolder = useShowInFolder();

  const [syncMessage, setSyncMessage] = React.useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  // Decide which skills are "enabled" for this space.
  // Match backend semantics in `get_visible_skills`: a skill is visible unless the user
  // has explicitly set it to false. Skills missing from the visibility map default to
  // visible. (Previously this filter incorrectly dropped any skill the user hadn't
  // explicitly toggled, even when other skills *had* been toggled.)
  const enabledSkillDirs = React.useMemo(
    () =>
      skills
        .filter((s) => visibilityMap[s.hash] ?? true)
        .map((s) => s.skillDir),
    [skills, visibilityMap]
  );

  const canSync = !!space.activeDirPath && !!libraryPath;

  const handleSync = async () => {
    if (!canSync) return;
    setSyncMessage(null);
    try {
      const result = await syncSpaceMutation.mutateAsync({
        libraryPath: libraryPath!,
        activePath: space.activeDirPath,
        enabledSkills: enabledSkillDirs,
      });
      if (result.failed.length > 0) {
        setSyncMessage({
          kind: "error",
          text: t("spaces.sync.partialFailure", {
            created: result.created,
            failed: result.failed.length,
            defaultValue: "Linked {{created}} skill(s); {{failed}} failed",
          }),
        });
      } else {
        setSyncMessage({
          kind: "success",
          text: t("spaces.sync.success", {
            created: result.created,
            defaultValue: "Linked {{created}} skill(s) to active directory",
          }),
        });
      }
    } catch (e) {
      setSyncMessage({
        kind: "error",
        text: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-text-primary">
              {space.name}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              {space.description || t("spaces.noDescription")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              {t("common.edit")}
            </Button>
            <Button variant="secondary" size="sm" onClick={onClone}>
              <CopyPlus className="mr-1.5 h-3.5 w-3.5" />
              {t("common.clone")}
            </Button>
            {!space.isDefault && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-accent-red hover:bg-accent-red/10 hover:text-accent-red"
                onClick={onDelete}
                title={t("common.delete")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border-default bg-bg-secondary p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-text-primary tabular-nums">
                {visibleSkillCount}
              </span>
              {totalSkills > 0 && (
                <span className="text-sm text-text-muted tabular-nums">
                  / {totalSkills}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-text-muted">
              {t("spaces.info.activeSkills")}
            </div>
          </div>
          <button
            type="button"
            className="group rounded-lg border border-border-default bg-bg-secondary p-4 text-left transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => space.activeDirPath && showInFolder.mutate(space.activeDirPath)}
            disabled={!space.activeDirPath}
            title={space.activeDirPath || t("common.notSet")}
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 shrink-0 text-text-muted group-hover:text-accent-blue" />
              <span className="truncate text-sm text-text-primary">
                {space.activeDirPath || t("common.notSet")}
              </span>
            </div>
            <div className="mt-1 text-xs text-text-muted">
              {t("spaces.info.activeDirectory")}
            </div>
          </button>
        </div>

        <div className="space-y-2">
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={onManageSkills}
            disabled={totalSkills === 0}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("spaces.actions.manageSkills")}
            <span className="ml-auto text-xs text-text-muted tabular-nums">
              {visibleSkillCount}/{totalSkills}
            </span>
          </Button>

          <Button
            className="w-full justify-start"
            onClick={handleSync}
            disabled={!canSync || syncSpaceMutation.isPending || enabledSkillDirs.length === 0}
          >
            {syncSpaceMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t("spaces.actions.applyToActiveDir", "Apply to Active directory")}
            <span className="ml-auto text-xs text-white/70 tabular-nums">
              {enabledSkillDirs.length}
            </span>
          </Button>
        </div>

        {syncMessage && (
          <Alert tone={syncMessage.kind === "success" ? "success" : "error"}>
            {syncMessage.text}
          </Alert>
        )}

        {!space.activeDirPath && (
          <Alert tone="warning">
            {t(
              "spaces.sync.needActiveDir",
              "Set an Active directory in the space settings to enable symlink sync."
            )}
          </Alert>
        )}
      </div>
    </div>
  );
};
