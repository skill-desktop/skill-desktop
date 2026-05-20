import React from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Folder,
  Trash2,
  Loader2,
  Copy,
  Check,
  Shield,
  ShieldAlert,
  RefreshCw,
  Download,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import { useDeleteSkill, useShowInFolder, useQuarantinedSkills, useSetSkillQuarantine, useCheckSkillUpdate, useSkillInstallations } from "@/hooks";
import { useImportSkillFromUrl } from "@/hooks/useImport";
import { Button, ScrollArea, ConfirmDialog } from "@/components/ui";
import { FileEditorDialog } from "@/components/editor/FileEditorDialog";
import { InstallSkillDialog } from "./InstallSkillDialog";
import type { Skill } from "@/types";
import { TabButton, OverviewTab, SecurityTab } from "./detail";

interface SkillDetailProps {
  skill: Skill | null;
}

export const SkillDetail: React.FC<SkillDetailProps> = ({ skill }) => {
  const { t } = useTranslation();
  const { setSelectedSkillHash, detailPanelOpen, setDetailPanelOpen } =
    useAppStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"overview" | "security">("overview");
  const [copied, setCopied] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingFilePath, setEditingFilePath] = React.useState<string>("");
  const [installDialogOpen, setInstallDialogOpen] = React.useState(false);

  const deleteSkillMutation = useDeleteSkill();
  const showInFolderMutation = useShowInFolder();
  const { data: quarantinedHashes = [] } = useQuarantinedSkills();
  const setQuarantineMutation = useSetSkillQuarantine();
  const checkUpdateMutation = useCheckSkillUpdate();
  const importSkillMutation = useImportSkillFromUrl();
  const { data: installations = [] } = useSkillInstallations(skill?.skillId ?? null);
  
  // Update check state
  const [updateAvailable, setUpdateAvailable] = React.useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = React.useState(false);

  // Check if current skill is quarantined
  const isQuarantined = skill ? quarantinedHashes.includes(skill.hash) : false;
  
  // Check if skill has a source URL (can check for updates)
  const canCheckUpdate = skill?.sourceUrl && skill.isDownloaded;

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

  const handleOpenFile = (filePath: string) => {
    setEditingFilePath(filePath);
    setEditorOpen(true);
  };

  const handleShowInFinder = async () => {
    try {
      // Show the skill directory, not the file
      await showInFolderMutation.mutateAsync(skill.skillDir);
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

  const handleCheckUpdate = async () => {
    if (!skill?.sourceUrl) return;
    
    try {
      const result = await checkUpdateMutation.mutateAsync({
        sourceUrl: skill.sourceUrl,
        currentHash: skill.hash,
      });
      
      if (result.hasUpdate) {
        setUpdateAvailable(true);
        setShowUpdateDialog(true);
      } else {
        setUpdateAvailable(false);
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
    }
  };

  const handleApplyUpdate = async () => {
    if (!skill?.sourceUrl) return;
    
    try {
      await importSkillMutation.mutateAsync(skill.sourceUrl);
      setShowUpdateDialog(false);
      setUpdateAvailable(false);
    } catch (error) {
      console.error("Failed to apply update:", error);
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
                {skill.author && ` · ${t("skillCard.by")} ${skill.author}`}
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
              {t("skillDetail.tabs.overview")}
            </TabButton>
            <TabButton
              active={activeTab === "security"}
              onClick={() => setActiveTab("security")}
            >
              {t("skillDetail.tabs.security")}
            </TabButton>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-4">
          {activeTab === "overview" && <OverviewTab skill={skill} onOpenFile={handleOpenFile} />}
          {activeTab === "security" && <SecurityTab skill={skill} />}
        </ScrollArea>

        {/* Quarantine status banner */}
        {isQuarantined && (
          <div className="flex items-center gap-2 border-t border-accent-yellow/30 bg-accent-yellow/10 px-4 py-2">
            <ShieldAlert className="h-4 w-4 text-accent-yellow" />
            <span className="text-xs text-accent-yellow">{t("skillCard.quarantined")}</span>
          </div>
        )}

        {/* Update available banner */}
        {updateAvailable && (
          <div className="flex items-center gap-2 border-t border-accent-blue/30 bg-accent-blue/10 px-4 py-2">
            <RefreshCw className="h-4 w-4 text-accent-blue" />
            <span className="text-xs text-accent-blue flex-1">{t("skillDetail.updateAvailable")}</span>
            <Button size="sm" variant="secondary" onClick={() => setShowUpdateDialog(true)}>
              {t("skillDetail.actions.update")}
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-border-default p-4">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => setInstallDialogOpen(true)}
            title={t("skillDetail.actions.installTitle", "Install to AI tool")}
          >
            <Share2 className="h-3.5 w-3.5 mr-1.5" />
            {installations.length > 0
              ? t("skillDetail.actions.installedCount", {
                  count: installations.length,
                  defaultValue: "Installed ({{count}})",
                })
              : t("skillDetail.actions.install", "Install")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleShowInFinder}
            disabled={showInFolderMutation.isPending}
            title={t("skillDetail.actions.reveal")}
          >
            {showInFolderMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Folder className="h-3.5 w-3.5" />
            )}
          </Button>
          {canCheckUpdate && (
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", updateAvailable ? "text-accent-blue" : "text-text-muted")}
              onClick={handleCheckUpdate}
              disabled={checkUpdateMutation.isPending}
              title={t("skillDetail.actions.checkUpdate")}
            >
              {checkUpdateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", isQuarantined ? "text-accent-yellow" : "text-text-muted")}
            onClick={handleToggleQuarantine}
            disabled={setQuarantineMutation.isPending}
            title={isQuarantined ? t("skillDetail.actions.unquarantine") : t("skillDetail.actions.quarantine")}
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

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t("skillDetail.deleteConfirm.title")}
        description={t("skillDetail.deleteConfirm.description", { name: skill.name })}
        tone="danger"
        confirmLabel={t("common.delete")}
        confirmIcon={<Trash2 className="h-3.5 w-3.5" />}
        cancelLabel={t("common.cancel")}
        isPending={deleteSkillMutation.isPending}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={showUpdateDialog}
        onOpenChange={setShowUpdateDialog}
        title={t("skillDetail.updateConfirm.title")}
        description={t("skillDetail.updateConfirm.description", { name: skill.name })}
        confirmLabel={t("skillDetail.actions.update")}
        confirmIcon={<Download className="h-3.5 w-3.5" />}
        cancelLabel={t("common.cancel")}
        isPending={importSkillMutation.isPending}
        onConfirm={handleApplyUpdate}
      />

      
      {/* File Editor Dialog */}
      <FileEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        filePath={editingFilePath}
      />

      {/* Install to AI Tool */}
      <InstallSkillDialog
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        skill={skill}
      />
    </>
  );
};
