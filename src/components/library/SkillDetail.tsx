import React from "react";
import {
  X,
  ExternalLink,
  Folder,
  Trash2,
  FileText,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import { useDeleteSkill, useShowInFolder, useOpenFile } from "@/hooks";
import { Button, Badge, ScrollArea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Markdown } from "@/components/ui";
import type { Skill } from "@/types";
import { getPermissionLevel } from "@/types";

interface SkillDetailProps {
  skill: Skill | null;
}

export const SkillDetail: React.FC<SkillDetailProps> = ({ skill }) => {
  const { setSelectedSkillHash, detailPanelOpen, setDetailPanelOpen } =
    useAppStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const deleteSkillMutation = useDeleteSkill();
  const showInFolderMutation = useShowInFolder();
  const openFileMutation = useOpenFile();

  if (!skill || !detailPanelOpen) {
    return null;
  }

  const handleClose = () => {
    setSelectedSkillHash(null);
    setDetailPanelOpen(false);
  };

  const handleViewSource = async () => {
    try {
      await openFileMutation.mutateAsync(skill.localPath);
    } catch (error) {
      console.error("Failed to open file:", error);
    }
  };

  const handleShowInFinder = async () => {
    try {
      await showInFolderMutation.mutateAsync(skill.localPath);
    } catch (error) {
      console.error("Failed to show in folder:", error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSkillMutation.mutateAsync(skill.hash);
      setShowDeleteConfirm(false);
      handleClose();
    } catch (error) {
      console.error("Failed to delete skill:", error);
    }
  };

  return (
    <>
      <aside className="flex h-full w-[360px] flex-col border-l border-border-default bg-bg-secondary">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border-default p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-primary truncate">
              {skill.name}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {skill.author ? `by ${skill.author}` : "Unknown author"} · v
              {skill.version}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-4">
          {/* Description */}
          <Section title="Description">
            <Markdown 
              content={skill.description || "No description available"} 
              className="text-xs text-text-secondary"
            />
          </Section>

          {/* Tags */}
          {skill.tags.length > 0 && (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1">
                {skill.tags.map((tag) => (
                  <Badge key={tag} variant="blue" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {/* Permissions */}
          <Section title="Permissions">
            {skill.permissions.length > 0 ? (
              <div className="space-y-2">
                {skill.permissions.map((permission) => {
                  const level = getPermissionLevel(permission);
                  return (
                    <div
                      key={permission}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            level === "low" && "bg-permission-low",
                            level === "medium" && "bg-permission-medium",
                            level === "high" && "bg-permission-high"
                          )}
                        />
                        <span className="text-xs text-text-primary">
                          {permission}
                        </span>
                      </div>
                      <Badge variant={level} className="text-[10px]">
                        {level === "low"
                          ? "Low Risk"
                          : level === "medium"
                          ? "Medium Risk"
                          : "High Risk"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-text-muted">No permissions required</p>
            )}
          </Section>

          {/* Parameters */}
          {skill.parameters.length > 0 && (
            <Section title="Parameters">
              <div className="space-y-3">
                {skill.parameters.map((param) => (
                  <div key={param.name}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text-primary">
                        {param.name}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        ({param.type})
                      </span>
                      {param.required && (
                        <span className="text-[10px] text-accent-red">
                          *required
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      {param.description}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Source */}
          <Section title="Source">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{skill.localPath}</span>
            </div>
            {skill.sourceUrl && (
              <div className="flex items-center gap-2 text-xs text-accent-blue mt-1">
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <a
                  href={skill.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:underline"
                >
                  {skill.sourceUrl}
                </a>
              </div>
            )}
          </Section>

          {/* Warning for high-risk permissions */}
          {skill.permissions.some(
            (p) => getPermissionLevel(p) === "high"
          ) && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-permission-high/50 bg-permission-high/10 p-3">
              <AlertTriangle className="h-4 w-4 text-permission-high shrink-0 mt-0.5" />
              <p className="text-xs text-permission-high">
                This skill requires high-risk permissions. Make sure you trust the
                source before enabling it.
              </p>
            </div>
          )}
        </ScrollArea>

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-border-default p-4">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={handleViewSource}
            disabled={openFileMutation.isPending}
          >
            {openFileMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5 mr-1.5" />
            )}
            View Source
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={handleShowInFinder}
            disabled={showInFolderMutation.isPending}
          >
            {showInFolderMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Folder className="h-3.5 w-3.5 mr-1.5" />
            )}
            Show in Finder
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-accent-red"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </aside>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Skill</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{skill.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteSkillMutation.isPending}
            >
              {deleteSkillMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="mb-4">
    <h3 className="text-xs font-medium text-text-muted mb-2">{title}</h3>
    {children}
  </div>
);
