import React from "react";
import { useTranslation } from "react-i18next";
import { Plus, Settings2, Trash2, FolderOpen, Check, Loader2, Download, Copy, FileJson, Link, CopyPlus, Server } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { Button, Input, ScrollArea, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui";
import {
  useSpaces,
  useCreateSpace,
  useUpdateSpace,
  useDeleteSpace,
  useSkills,
  useExportClaudeConfig,
  useExportGenericConfig,
  useExportMcpConfig,
  useSkillVisibilityMap,
  useSetSkillVisibility,
  useSetBulkSkillVisibility,
  useSyncSpace,
} from "@/hooks";
import { useAppStore, useSettingsStore } from "@/stores";

// Helper to open folder dialog via Tauri command
async function openFolderDialog(): Promise<string | null> {
  try {
    const result = await invoke<string | null>("plugin:dialog|open", {
      options: {
        directory: true,
        multiple: false,
        title: "Select Active Directory",
      },
    });
    return result;
  } catch (error) {
    console.error("Dialog error:", error);
    return null;
  }
}

// Helper to save file dialog via Tauri command
async function saveFileDialog(defaultPath: string): Promise<string | null> {
  try {
    const result = await invoke<string | null>("plugin:dialog|save", {
      options: {
        defaultPath,
        filters: [{ name: "JSON", extensions: ["json"] }],
      },
    });
    return result;
  } catch (error) {
    console.error("Dialog error:", error);
    return null;
  }
}

// Helper to write text file via Tauri command
async function writeFile(path: string, contents: string): Promise<void> {
  await invoke("plugin:fs|write_text_file", {
    path,
    contents,
  });
}

// Component to display skill count for a space
const SpaceSkillCount: React.FC<{ spaceId: string; totalSkills: number }> = ({ spaceId, totalSkills }) => {
  const { data: visibilityMap = {} } = useSkillVisibilityMap(spaceId);
  
  // If no visibility map exists, all skills are visible by default
  const visibleCount = Object.keys(visibilityMap).length > 0
    ? Object.values(visibilityMap).filter(Boolean).length
    : totalSkills;
  
  return (
    <span className="text-xs text-text-muted">
      {visibleCount} / {totalSkills} skills
    </span>
  );
};

export const SpacesView: React.FC = () => {
  const { t } = useTranslation();
  const { currentSpaceId, setCurrentSpaceId } = useAppStore();
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [showEditDialog, setShowEditDialog] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [showExportDialog, setShowExportDialog] = React.useState(false);
  const [exportConfig, setExportConfig] = React.useState<string | null>(null);
  const [exportType, setExportType] = React.useState<"claude" | "generic" | "mcp">("claude");
  const [showSkillsDialog, setShowSkillsDialog] = React.useState(false);
  const [showCloneDialog, setShowCloneDialog] = React.useState(false);
  const [cloneName, setCloneName] = React.useState("");
  const [cloneActiveDir, setCloneActiveDir] = React.useState("");

  // Form state
  const [formName, setFormName] = React.useState("");
  const [formActiveDir, setFormActiveDir] = React.useState("");
  const [formDescription, setFormDescription] = React.useState("");

  // Hooks
  const { data: spaces = [], isLoading } = useSpaces();
  const { data: skills = [] } = useSkills();
  const createSpaceMutation = useCreateSpace();
  const updateSpaceMutation = useUpdateSpace();
  const deleteSpaceMutation = useDeleteSpace();
  const exportClaudeMutation = useExportClaudeConfig();
  const exportGenericMutation = useExportGenericConfig();
  const exportMcpMutation = useExportMcpConfig();
  const setSkillVisibilityMutation = useSetSkillVisibility();
  const setBulkVisibilityMutation = useSetBulkSkillVisibility();
  const syncSpaceMutation = useSyncSpace();

  const { libraryPath } = useSettingsStore();

  // Get visibility map for selected space
  const { data: visibilityMap = {} } = useSkillVisibilityMap(currentSpaceId);

  // Count visible skills for current space
  const visibleSkillCount = Object.keys(visibilityMap).length > 0
    ? Object.values(visibilityMap).filter(Boolean).length
    : skills.length;

  const selectedSpace = spaces.find((s) => s.id === currentSpaceId);

  // Reset form
  const resetForm = () => {
    setFormName("");
    setFormActiveDir("");
    setFormDescription("");
  };

  // Open edit dialog with current space data
  const openEditDialog = () => {
    if (selectedSpace) {
      setFormName(selectedSpace.name);
      setFormActiveDir(selectedSpace.activeDirPath);
      setFormDescription(selectedSpace.description || "");
      setShowEditDialog(true);
    }
  };

  // Handle folder selection
  const handleSelectFolder = async () => {
    try {
      const selected = await openFolderDialog();

      if (selected && typeof selected === "string") {
        setFormActiveDir(selected);
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
    }
  };

  // Handle create space
  const handleCreateSpace = async () => {
    if (!formName || !formActiveDir) return;

    try {
      const newSpace = await createSpaceMutation.mutateAsync({
        name: formName,
        activeDir: formActiveDir,
        description: formDescription || undefined,
      });
      setShowCreateDialog(false);
      resetForm();
      setCurrentSpaceId(newSpace.id);
    } catch (error) {
      console.error("Failed to create space:", error);
    }
  };

  // Handle update space
  const handleUpdateSpace = async () => {
    if (!selectedSpace || !formName) return;

    try {
      await updateSpaceMutation.mutateAsync({
        id: selectedSpace.id,
        name: formName,
        activeDir: formActiveDir || undefined,
        description: formDescription || undefined,
      });
      setShowEditDialog(false);
      resetForm();
    } catch (error) {
      console.error("Failed to update space:", error);
    }
  };

  // Handle delete space
  const handleDeleteSpace = async () => {
    if (!selectedSpace) return;

    try {
      await deleteSpaceMutation.mutateAsync(selectedSpace.id);
      setShowDeleteConfirm(false);
      setCurrentSpaceId("default");
    } catch (error) {
      console.error("Failed to delete space:", error);
    }
  };

  // Handle export
  const handleExport = async (type: "claude" | "generic" | "mcp") => {
    if (!selectedSpace) return;
    setExportType(type);

    try {
      let config: string;
      if (type === "claude") {
        config = await exportClaudeMutation.mutateAsync(selectedSpace.id);
      } else if (type === "mcp") {
        config = await exportMcpMutation.mutateAsync(selectedSpace.id);
      } else {
        config = await exportGenericMutation.mutateAsync(selectedSpace.id);
      }
      setExportConfig(config);
      setShowExportDialog(true);
    } catch (error) {
      console.error("Failed to export config:", error);
    }
  };

  // Handle save config to file
  const handleSaveConfig = async () => {
    if (!exportConfig) return;

    try {
      let filename: string;
      if (exportType === "claude") {
        filename = "claude_desktop_config.json";
      } else if (exportType === "mcp") {
        filename = `${selectedSpace?.name || "space"}_mcp_config.json`;
      } else {
        filename = `${selectedSpace?.name || "space"}_config.json`;
      }

      const filePath = await saveFileDialog(filename);

      if (filePath) {
        await writeFile(filePath, exportConfig);
        setShowExportDialog(false);
        setExportConfig(null);
      }
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  };

  // Handle copy config to clipboard
  const handleCopyConfig = async () => {
    if (!exportConfig) return;
    try {
      await navigator.clipboard.writeText(exportConfig);
    } catch (error) {
      console.error("Failed to copy config:", error);
    }
  };

  // Auto-sync symlinks after visibility change
  const autoSyncSymlinks = React.useCallback(async (newVisibilityMap: Record<string, boolean>) => {
    if (!selectedSpace || !libraryPath || !selectedSpace.activeDirPath) return;
    
    // Get visible skill full paths based on new visibility map
    const visibleSkillPaths = skills
      .filter((s) => newVisibilityMap[s.hash] ?? true)
      .map((s) => s.localPath);
    
    try {
      await syncSpaceMutation.mutateAsync({
        libraryPath,
        activePath: selectedSpace.activeDirPath,
        enabledSkills: visibleSkillPaths,
      });
    } catch (error) {
      console.error("Failed to auto-sync symlinks:", error);
    }
  }, [selectedSpace, libraryPath, skills, syncSpaceMutation]);

  // Handle skill visibility toggle
  const handleToggleSkillVisibility = async (skillHash: string, isVisible: boolean) => {
    if (!currentSpaceId) return;
    try {
      await setSkillVisibilityMutation.mutateAsync({
        spaceId: currentSpaceId,
        skillHash,
        isVisible,
      });
      
      // Auto-sync symlinks if active directory is set
      if (selectedSpace?.activeDirPath) {
        const newVisibilityMap = { ...visibilityMap, [skillHash]: isVisible };
        await autoSyncSymlinks(newVisibilityMap);
      }
    } catch (error) {
      console.error("Failed to toggle visibility:", error);
    }
  };

  // Handle select all skills
  const handleSelectAllSkills = async () => {
    if (!currentSpaceId) return;
    try {
      await setBulkVisibilityMutation.mutateAsync({
        spaceId: currentSpaceId,
        skillHashes: skills.map((s) => s.hash),
        isVisible: true,
      });
      
      // Auto-sync symlinks if active directory is set
      if (selectedSpace?.activeDirPath) {
        const newVisibilityMap = { ...visibilityMap };
        skills.forEach(s => { newVisibilityMap[s.hash] = true; });
        await autoSyncSymlinks(newVisibilityMap);
      }
    } catch (error) {
      console.error("Failed to select all:", error);
    }
  };

  // Handle deselect all skills
  const handleDeselectAllSkills = async () => {
    if (!currentSpaceId) return;
    try {
      await setBulkVisibilityMutation.mutateAsync({
        spaceId: currentSpaceId,
        skillHashes: skills.map((s) => s.hash),
        isVisible: false,
      });
      
      // Auto-sync symlinks if active directory is set
      if (selectedSpace?.activeDirPath) {
        const newVisibilityMap = { ...visibilityMap };
        skills.forEach(s => { newVisibilityMap[s.hash] = false; });
        await autoSyncSymlinks(newVisibilityMap);
      }
    } catch (error) {
      console.error("Failed to deselect all:", error);
    }
  };

  // Handle sync space symlinks
  const handleSyncSpace = async () => {
    if (!selectedSpace || !libraryPath || !selectedSpace.activeDirPath) return;

    // Get visible skill full paths
    const visibleSkillPaths = skills
      .filter((s) => visibilityMap[s.hash] ?? true)
      .map((s) => s.localPath);

    try {
      const result = await syncSpaceMutation.mutateAsync({
        libraryPath,
        activePath: selectedSpace.activeDirPath,
        enabledSkills: visibleSkillPaths,
      });
      console.log("Sync result:", result);
    } catch (error) {
      console.error("Failed to sync space:", error);
    }
  };

  // Handle clone space
  const openCloneDialog = () => {
    if (selectedSpace) {
      setCloneName(`${selectedSpace.name} (Copy)`);
      setCloneActiveDir("");
      setShowCloneDialog(true);
    }
  };

  const handleCloneSpace = async () => {
    if (!selectedSpace || !cloneName || !cloneActiveDir) return;

    try {
      // Create new space
      const newSpace = await createSpaceMutation.mutateAsync({
        name: cloneName,
        activeDir: cloneActiveDir,
        description: selectedSpace.description || undefined,
      });

      // Copy visibility settings from source space
      const visibleHashes = Object.entries(visibilityMap)
        .filter(([_, isVisible]) => isVisible)
        .map(([hash]) => hash);

      if (visibleHashes.length > 0) {
        await setBulkVisibilityMutation.mutateAsync({
          spaceId: newSpace.id,
          skillHashes: visibleHashes,
          isVisible: true,
        });
      }

      // Also set non-visible ones
      const hiddenHashes = Object.entries(visibilityMap)
        .filter(([_, isVisible]) => !isVisible)
        .map(([hash]) => hash);

      if (hiddenHashes.length > 0) {
        await setBulkVisibilityMutation.mutateAsync({
          spaceId: newSpace.id,
          skillHashes: hiddenHashes,
          isVisible: false,
        });
      }

      setShowCloneDialog(false);
      setCurrentSpaceId(newSpace.id);
    } catch (error) {
      console.error("Failed to clone space:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full">
        {/* Space list */}
        <div className="w-72 border-r border-border-default bg-bg-secondary">
          <div className="flex items-center justify-between border-b border-border-default p-3">
            <h2 className="text-sm font-medium text-text-primary">{t("spaces.title")}</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                resetForm();
                setShowCreateDialog(true);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="h-[calc(100%-49px)]">
            {spaces.map((space) => (
              <button
                key={space.id}
                className={cn(
                  "flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-bg-tertiary",
                  currentSpaceId === space.id && "bg-bg-tertiary"
                )}
                onClick={() => setCurrentSpaceId(space.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {space.name}
                    </span>
                    {space.isDefault && (
                      <Badge variant="blue" className="text-[10px]">
                        {t("common.default")}
                      </Badge>
                    )}
                  </div>
                  <SpaceSkillCount spaceId={space.id} totalSkills={skills.length} />
                </div>
                {currentSpaceId === space.id && (
                  <Check className="h-4 w-4 text-accent-blue shrink-0" />
                )}
              </button>
            ))}
          </ScrollArea>
        </div>

        {/* Space detail */}
        {selectedSpace ? (
          <div className="flex-1 p-6">
            <div className="max-w-2xl">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h1 className="text-xl font-semibold text-text-primary">
                    {selectedSpace.name}
                  </h1>
                  <p className="text-sm text-text-secondary mt-1">
                    {selectedSpace.description || t("spaces.noDescription")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={openEditDialog}>
                    <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                    {t("common.edit")}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={openCloneDialog}>
                    <CopyPlus className="h-3.5 w-3.5 mr-1.5" />
                    {t("common.clone")}
                  </Button>
                  {!selectedSpace.isDefault && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-accent-red"
                      onClick={() => setShowDeleteConfirm(true)}
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
                  {t("spaces.info.activeSkills")} {skills.length > 0 && `/ ${skills.length} ${t("common.total")}`}
                </div>
              </div>
                <div className="rounded-lg border border-border-default bg-bg-secondary p-4">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5 text-text-muted" />
                    <span className="text-sm text-text-primary truncate">
                      {selectedSpace.activeDirPath || t("common.notSet")}
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
                onClick={() => setShowSkillsDialog(true)}
                disabled={skills.length === 0}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("spaces.actions.manageSkills")} ({visibleSkillCount}/{skills.length})
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => handleExport("claude")}
                disabled={exportClaudeMutation.isPending}
              >
                {exportClaudeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {t("spaces.actions.exportClaudeConfig")}
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => handleExport("generic")}
                disabled={exportGenericMutation.isPending}
              >
                {exportGenericMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileJson className="h-4 w-4 mr-2" />
                )}
                {t("spaces.actions.exportGenericJson")}
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => handleExport("mcp")}
                disabled={exportMcpMutation.isPending}
              >
                {exportMcpMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Server className="h-4 w-4 mr-2" />
                )}
                {t("spaces.actions.exportMcpConfig")}
              </Button>

              {/* Sync symlinks button */}
              {selectedSpace?.activeDirPath && (
                <Button
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={handleSyncSpace}
                  disabled={syncSpaceMutation.isPending || !libraryPath}
                >
                  {syncSpaceMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : syncSpaceMutation.isSuccess ? (
                    <Check className="h-4 w-4 mr-2" />
                  ) : (
                    <Link className="h-4 w-4 mr-2" />
                  )}
                  {syncSpaceMutation.isPending
                    ? t("spaces.actions.syncing")
                    : syncSpaceMutation.isSuccess
                    ? t("spaces.actions.syncedSkills", { count: syncSpaceMutation.data?.created })
                    : t("spaces.actions.syncSymlinks")}
                </Button>
              )}
            </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-text-muted">
            <p>{t("spaces.selectSpace")}</p>
          </div>
        )}
      </div>

      {/* Create Space Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("spaces.createSpace")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                {t("spaces.form.spaceNameRequired")}
              </label>
              <Input
                placeholder={t("spaces.form.spaceNamePlaceholder")}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                {t("spaces.form.activeDirectoryRequired")}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder={t("spaces.form.activeDirectoryPlaceholder")}
                  value={formActiveDir}
                  onChange={(e) => setFormActiveDir(e.target.value)}
                  className="flex-1"
                />
                <Button variant="secondary" size="sm" onClick={handleSelectFolder}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                {t("spaces.form.descriptionOptional")}
              </label>
              <Input
                placeholder={t("spaces.form.descriptionPlaceholder")}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCreateDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreateSpace}
              disabled={!formName || !formActiveDir || createSpaceMutation.isPending}
            >
              {createSpaceMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1.5" />
              )}
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Space Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("spaces.editSpace")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                {t("spaces.form.spaceNameRequired")}
              </label>
              <Input
                placeholder={t("spaces.form.spaceNamePlaceholder")}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                {t("spaces.form.activeDirectory")}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder={t("spaces.form.activeDirectoryPlaceholder")}
                  value={formActiveDir}
                  onChange={(e) => setFormActiveDir(e.target.value)}
                  className="flex-1"
                />
                <Button variant="secondary" size="sm" onClick={handleSelectFolder}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                {t("spaces.form.description")}
              </label>
              <Input
                placeholder={t("spaces.form.descriptionPlaceholder")}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowEditDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleUpdateSpace}
              disabled={!formName || updateSpaceMutation.isPending}
            >
              {updateSpaceMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-1.5" />
              )}
              {t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("spaces.deleteConfirm.title")}</DialogTitle>
            <DialogDescription>
              {t("spaces.deleteConfirm.description", { name: selectedSpace?.name })}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSpace}
              disabled={deleteSpaceMutation.isPending}
            >
              {deleteSpaceMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Skills Dialog */}
      <Dialog open={showSkillsDialog} onOpenChange={setShowSkillsDialog}>
        <DialogContent className="max-w-[600px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("spaces.manageSkillsDialog.title", { name: selectedSpace?.name })}</DialogTitle>
          </DialogHeader>

          {/* Actions */}
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSelectAllSkills}
              disabled={setBulkVisibilityMutation.isPending}
            >
              {t("common.selectAll")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDeselectAllSkills}
              disabled={setBulkVisibilityMutation.isPending}
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
                      onChange={(e) => handleToggleSkillVisibility(skill.hash, e.target.checked)}
                      className="h-4 w-4 rounded border-border-default"
                      disabled={setSkillVisibilityMutation.isPending}
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
            <Button onClick={() => setShowSkillsDialog(false)}>
              {t("common.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone Space Dialog */}
      <Dialog open={showCloneDialog} onOpenChange={setShowCloneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("spaces.cloneDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("spaces.cloneDialog.description", { name: selectedSpace?.name })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                {t("spaces.cloneDialog.newSpaceName")} *
              </label>
              <Input
                placeholder={t("spaces.cloneDialog.newSpaceNamePlaceholder")}
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                {t("spaces.form.activeDirectoryRequired")}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder={t("spaces.form.activeDirectoryPlaceholder")}
                  value={cloneActiveDir}
                  onChange={(e) => setCloneActiveDir(e.target.value)}
                  className="flex-1"
                />
                <Button variant="secondary" size="sm" onClick={async () => {
                  const selected = await openFolderDialog();
                  if (selected) setCloneActiveDir(selected);
                }}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCloneDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCloneSpace}
              disabled={!cloneName || !cloneActiveDir || createSpaceMutation.isPending}
            >
              {createSpaceMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <CopyPlus className="h-4 w-4 mr-1.5" />
              )}
              {t("spaces.cloneSpace")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-[600px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {exportType === "claude" 
                ? t("spaces.exportDialog.claudeTitle")
                : exportType === "mcp" 
                ? t("spaces.exportDialog.mcpTitle")
                : t("spaces.exportDialog.genericTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden mb-4">
            <pre className="text-xs text-text-secondary bg-bg-tertiary rounded-md p-4 overflow-auto max-h-[400px]">
              {exportConfig}
            </pre>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={handleCopyConfig}>
              <Copy className="h-4 w-4 mr-1.5" />
              {t("common.copyToClipboard")}
            </Button>
            <Button onClick={handleSaveConfig}>
              <Download className="h-4 w-4 mr-1.5" />
              {t("common.saveToFile")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
