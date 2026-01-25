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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
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
          draggable={draggable && !selectionMode}
          onDragStart={handleDragStart}
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
                  {t("skillCard.by")} {skill.author}
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
          {skill.description || t("skillCard.noDescription")}
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
              <span className="text-[10px] text-text-muted">{t("skillDetail.permissions")}: 0</span>
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
