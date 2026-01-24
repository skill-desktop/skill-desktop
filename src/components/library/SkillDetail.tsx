import React from "react";
import {
  X,
  ExternalLink,
  Folder,
  Trash2,
  FileText,
  AlertTriangle,
  Loader2,
  Copy,
  Check,
  Code,
  BookOpen,
  Shield,
  ShieldAlert,
  Tag,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import { useDeleteSkill, useShowInFolder, useOpenFile, useSkillContent, useQuarantinedSkills, useSetSkillQuarantine } from "@/hooks";
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
  const [activeTab, setActiveTab] = React.useState<"overview" | "content" | "source">("overview");
  const [copied, setCopied] = React.useState(false);

  const deleteSkillMutation = useDeleteSkill();
  const showInFolderMutation = useShowInFolder();
  const openFileMutation = useOpenFile();
  const { data: skillContent } = useSkillContent(skill?.hash || null);
  const { data: quarantinedHashes = [] } = useQuarantinedSkills();
  const setQuarantineMutation = useSetSkillQuarantine();

  // Check if current skill is quarantined
  const isQuarantined = skill ? quarantinedHashes.includes(skill.hash) : false;

  if (!skill || !detailPanelOpen) {
    return null;
  }

  const handleToggleQuarantine = async () => {
    try {
      await setQuarantineMutation.mutateAsync({ 
        hash: skill.hash, 
        isQuarantined: !isQuarantined 
      });
    } catch (error) {
      console.error("Failed to toggle quarantine:", error);
    }
  };

  const handleCopyName = async () => {
    try {
      await navigator.clipboard.writeText(skill.name);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

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
      <aside className="flex h-full w-[400px] flex-col border-l border-border-default bg-bg-secondary">
        {/* Header */}
        <div className="border-b border-border-default p-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-text-primary truncate">
                  {skill.name}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={handleCopyName}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-accent-green" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                v{skill.version}
                {skill.author && ` · by ${skill.author}`}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            <TabButton
              active={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
            >
              Overview
            </TabButton>
            <TabButton
              active={activeTab === "content"}
              onClick={() => setActiveTab("content")}
            >
              Content
            </TabButton>
            <TabButton
              active={activeTab === "source"}
              onClick={() => setActiveTab("source")}
            >
              Source
            </TabButton>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-4">
          {activeTab === "overview" && (
            <>
              {/* Description */}
              <Section title="Description" icon={<BookOpen className="h-3.5 w-3.5" />}>
                <Markdown 
                  content={skill.description || "No description available"} 
                  className="text-xs text-text-secondary"
                />
              </Section>

              {/* Tags */}
              {skill.tags.length > 0 && (
                <Section title="Tags" icon={<Tag className="h-3.5 w-3.5" />}>
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
              <Section title="Permissions" icon={<Shield className="h-3.5 w-3.5" />}>
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
                <Section title="Parameters" icon={<Code className="h-3.5 w-3.5" />}>
                  <div className="space-y-3">
                    {skill.parameters.map((param) => (
                      <div key={param.name} className="rounded-md border border-border-muted bg-bg-tertiary p-2">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-medium text-accent-blue">
                            {param.name}
                          </code>
                          <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-bg-elevated">
                            {param.type}
                          </span>
                          {param.required && (
                            <span className="text-[10px] text-accent-red">
                              required
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-text-secondary mt-1">
                          {param.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Metadata */}
              <Section title="Metadata" icon={<Hash className="h-3.5 w-3.5" />}>
                <div className="space-y-2 text-xs">
                  <MetadataRow label="Filename" value={skill.filename} />
                  <MetadataRow label="Hash" value={skill.hash.slice(0, 12) + "..."} />
                  {skill.isDownloaded && (
                    <MetadataRow label="Source" value="Downloaded" />
                  )}
                </div>
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
            </>
          )}

          {activeTab === "content" && (
            <div className="space-y-4">
              {skillContent ? (
                <Markdown 
                  content={skillContent.replace(/^---[\s\S]*?---\n/, '')} 
                  className="text-xs"
                />
              ) : (
                <div className="text-xs text-text-muted text-center py-8">
                  Loading content...
                </div>
              )}
            </div>
          )}

          {activeTab === "source" && (
            <div className="space-y-4">
              {/* File location */}
              <Section title="File Location" icon={<Folder className="h-3.5 w-3.5" />}>
                <div className="rounded-md border border-border-muted bg-bg-tertiary p-2">
                  <code className="text-xs text-text-secondary break-all">
                    {skill.localPath}
                  </code>
                </div>
              </Section>

              {/* Source URL */}
              {skill.sourceUrl && (
                <Section title="Source URL" icon={<ExternalLink className="h-3.5 w-3.5" />}>
                  <a
                    href={skill.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-blue hover:underline break-all"
                  >
                    {skill.sourceUrl}
                  </a>
                </Section>
              )}

              {/* Raw source */}
              <Section title="Raw Source" icon={<FileText className="h-3.5 w-3.5" />}>
                {skillContent ? (
                  <pre className="text-[11px] text-text-secondary bg-bg-tertiary rounded-md p-3 overflow-x-auto max-h-96 whitespace-pre-wrap">
                    {skillContent}
                  </pre>
                ) : (
                  <div className="text-xs text-text-muted text-center py-4">
                    Loading...
                  </div>
                )}
              </Section>
            </div>
          )}
        </ScrollArea>

        {/* Quarantine status banner */}
        {isQuarantined && (
          <div className="flex items-center gap-2 border-t border-accent-yellow/30 bg-accent-yellow/10 px-4 py-2">
            <ShieldAlert className="h-4 w-4 text-accent-yellow" />
            <span className="text-xs text-accent-yellow">This skill is quarantined</span>
          </div>
        )}

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
            Edit
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
            Reveal
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", isQuarantined ? "text-accent-yellow" : "text-text-muted")}
            onClick={handleToggleQuarantine}
            disabled={setQuarantineMutation.isPending}
            title={isQuarantined ? "Remove from quarantine" : "Add to quarantine"}
          >
            {setQuarantineMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isQuarantined ? (
              <Shield className="h-3.5 w-3.5" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5" />
            )}
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

const Section: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <div className="mb-4">
    <h3 className="flex items-center gap-1.5 text-xs font-medium text-text-muted mb-2">
      {icon}
      {title}
    </h3>
    {children}
  </div>
);

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    className={cn(
      "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
      active
        ? "bg-bg-tertiary text-text-primary"
        : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary/50"
    )}
    onClick={onClick}
  >
    {children}
  </button>
);

const MetadataRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-text-muted">{label}</span>
    <span className="text-text-secondary font-mono">{value}</span>
  </div>
);
