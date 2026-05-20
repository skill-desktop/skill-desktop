import React from "react";
import { useTranslation } from "react-i18next";
import { Download, ExternalLink, Shield, Tag, ShieldAlert, Eye, Folder, FileText, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import { Badge, Switch, ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui";
import { useShowInFolder, useOpenFile, useDeleteSkill, useSetSkillQuarantine } from "@/hooks";
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
  // Drag props
  draggable?: boolean;
}

// Export drag data type for type safety
export const SKILL_DRAG_TYPE = "application/skill-hash";

export const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  isVisible = true,
  onVisibilityChange,
  selectionMode = false,
  isSelected: isSelectedForBatch = false,
  onToggleSelection,
  isQuarantined = false,
  draggable = true,
}) => {
  const { t } = useTranslation();
  const { setSelectedSkillHash, selectedSkillHash, setCurrentView } = useAppStore();
  const showInFolderMutation = useShowInFolder();
  const openFileMutation = useOpenFile();
  const deleteSkillMutation = useDeleteSkill();
  const setQuarantineMutation = useSetSkillQuarantine();

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

  // Context menu handlers
  const handleViewDetails = () => {
    setSelectedSkillHash(skill.hash);
  };

  const handleViewSource = async () => {
    try {
      await openFileMutation.mutateAsync(skill.localPath);
    } catch (error) {
      console.error("Failed to open file:", error);
    }
  };

  const handleShowInFolder = async () => {
    try {
      await showInFolderMutation.mutateAsync(skill.localPath);
    } catch (error) {
      console.error("Failed to show in folder:", error);
    }
  };

  const handleToggleQuarantine = async () => {
    try {
      await setQuarantineMutation.mutateAsync({
        hash: skill.hash,
        isQuarantined: !isQuarantined,
      });
    } catch (error) {
      console.error("Failed to toggle quarantine:", error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSkillMutation.mutateAsync(skill.hash);
    } catch (error) {
      console.error("Failed to delete skill:", error);
    }
  };

  const handleAddToSpace = () => {
    // Navigate to spaces view to add skill
    setCurrentView("spaces");
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(SKILL_DRAG_TYPE, skill.hash);
    e.dataTransfer.setData("text/plain", skill.name);
    e.dataTransfer.effectAllowed = "copy";
  };

  // Top accent strip — colour communicates state at a glance: yellow for
  // quarantined, red for high-risk permissions, blue for remotely sourced,
  // green for local. Single solid colour reads as more deliberate than the
  // previous gradient strip and is easier to scan in a dense grid.
  const accentClass = isQuarantined
    ? "bg-accent-yellow"
    : hasHighRisk
    ? "bg-permission-high"
    : skill.isDownloaded
    ? "bg-accent-blue"
    : "bg-accent-green";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group relative cursor-pointer overflow-hidden rounded-lg border bg-bg-secondary shadow-sm transition-all hover:border-border-hover hover:shadow-md",
            selectionMode && isSelectedForBatch
              ? "border-accent-blue ring-2 ring-accent-blue/30"
              : isSelected
              ? "border-accent-blue ring-1 ring-accent-blue/20"
              : "border-border-default"
          )}
          onClick={handleClick}
          draggable={draggable && !selectionMode}
          onDragStart={handleDragStart}
        >
          <span
            aria-hidden
            className={cn("absolute inset-x-0 top-0 h-[3px]", accentClass)}
          />

          <div className="p-4 pt-[15px]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
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
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-text-primary">
                    {skill.name}
                  </h3>
                  {skill.author && (
                    <p className="truncate text-xs text-text-muted">
                      {t("skillCard.by")} {skill.author}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {isQuarantined && (
                  <ShieldAlert
                    className="h-3.5 w-3.5 text-accent-yellow"
                    aria-label="quarantined"
                  />
                )}
                <span className="rounded bg-bg-tertiary px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                  v{skill.version}
                </span>
              </div>
            </div>

            <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-text-secondary">
              {skill.description || t("skillCard.noDescription")}
            </p>

            {skill.tags.length > 0 && (
              <div className="mt-3 flex items-center gap-1">
                <Tag className="h-3 w-3 shrink-0 text-text-muted" />
                <div className="flex flex-wrap gap-1 overflow-hidden">
                  {skill.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted"
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

            <div className="mt-3 flex items-center justify-between border-t border-border-muted pt-3">
              <div className="flex min-w-0 items-center gap-1.5">
                {skill.permissions.length > 0 ? (
                  <>
                    <Shield className="h-3 w-3 shrink-0 text-text-muted" />
                    <div className="flex min-w-0 gap-1">
                      {skill.permissions.slice(0, 2).map((permission) => (
                        <Badge
                          key={permission}
                          variant={getPermissionLevel(permission)}
                          className="px-1.5 py-0 text-[10px]"
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
                  <span className="text-[10px] text-text-muted">
                    {t("skillDetail.permissions")}: 0
                  </span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2 text-text-muted">
                {skill.isDownloaded && (
                  <Download className="h-3 w-3 text-accent-blue" />
                )}
                {skill.sourceUrl && <ExternalLink className="h-3 w-3" />}
                {skill.parameters.length > 0 && (
                  <span className="text-[10px] tabular-nums">
                    {skill.parameters.length}p
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={handleViewDetails}>
          <Eye className="h-4 w-4" />
          {t("contextMenu.viewDetails")}
        </ContextMenuItem>
        <ContextMenuItem onClick={handleViewSource}>
          <FileText className="h-4 w-4" />
          {t("contextMenu.viewSource")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleAddToSpace}>
          <Plus className="h-4 w-4" />
          {t("contextMenu.addToSpace")}
        </ContextMenuItem>
        <ContextMenuItem onClick={handleShowInFolder}>
          <Folder className="h-4 w-4" />
          {t("contextMenu.showInFolder")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleToggleQuarantine}>
          <ShieldAlert className="h-4 w-4" />
          {isQuarantined ? t("contextMenu.removeFromQuarantine") : t("contextMenu.quarantine")}
        </ContextMenuItem>
        <ContextMenuItem onClick={handleDelete} destructive>
          <Trash2 className="h-4 w-4" />
          {t("contextMenu.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
