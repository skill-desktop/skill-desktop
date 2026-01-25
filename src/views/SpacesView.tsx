import React from "react";
import { useTranslation } from "react-i18next";
import { Plus, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button, ScrollArea } from "@/components/ui";
import {
  SpaceListItem,
  SpaceDetail,
  SpaceFormDialog,
  ManageSkillsDialog,
  ExportConfigDialog,
  DeleteSpaceDialog,
} from "@/components/spaces";
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

  // Form state
  const [formName, setFormName] = React.useState("");
  const [formActiveDir, setFormActiveDir] = React.useState("");
  const [formDescription, setFormDescription] = React.useState("");
  const [cloneName, setCloneName] = React.useState("");
  const [cloneActiveDir, setCloneActiveDir] = React.useState("");

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
    const selected = await openFolderDialog();
    if (selected && typeof selected === "string") {
      setFormActiveDir(selected);
    }
  };

  const handleSelectCloneFolder = async () => {
    const selected = await openFolderDialog();
    if (selected && typeof selected === "string") {
      setCloneActiveDir(selected);
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

    const visibleSkillPaths = skills
      .filter((s) => visibilityMap[s.hash] ?? true)
      .map((s) => s.localPath);

    try {
      await syncSpaceMutation.mutateAsync({
        libraryPath,
        activePath: selectedSpace.activeDirPath,
        enabledSkills: visibleSkillPaths,
      });
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
              data-action="new-space"
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
              <SpaceListItem
                key={space.id}
                space={space}
                isSelected={currentSpaceId === space.id}
                totalSkills={skills.length}
                onSelect={() => setCurrentSpaceId(space.id)}
              />
            ))}
          </ScrollArea>
        </div>

        {/* Space detail */}
        {selectedSpace ? (
          <SpaceDetail
            space={selectedSpace}
            visibleSkillCount={visibleSkillCount}
            totalSkills={skills.length}
            libraryPath={libraryPath}
            onEdit={openEditDialog}
            onClone={openCloneDialog}
            onDelete={() => setShowDeleteConfirm(true)}
            onManageSkills={() => setShowSkillsDialog(true)}
            onExportClaude={() => handleExport("claude")}
            onExportGeneric={() => handleExport("generic")}
            onExportMcp={() => handleExport("mcp")}
            onSyncSymlinks={handleSyncSpace}
            isExportingClaude={exportClaudeMutation.isPending}
            isExportingGeneric={exportGenericMutation.isPending}
            isExportingMcp={exportMcpMutation.isPending}
            isSyncing={syncSpaceMutation.isPending}
            syncSuccess={syncSpaceMutation.isSuccess}
            syncedCount={syncSpaceMutation.data?.created}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-text-muted">
            <p>{t("spaces.selectSpace")}</p>
          </div>
        )}
      </div>

      {/* Create Space Dialog */}
      <SpaceFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        mode="create"
        name={formName}
        activeDir={formActiveDir}
        description={formDescription}
        onNameChange={setFormName}
        onActiveDirChange={setFormActiveDir}
        onDescriptionChange={setFormDescription}
        onSelectFolder={handleSelectFolder}
        onSubmit={handleCreateSpace}
        isSubmitting={createSpaceMutation.isPending}
      />

      {/* Edit Space Dialog */}
      <SpaceFormDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        mode="edit"
        name={formName}
        activeDir={formActiveDir}
        description={formDescription}
        onNameChange={setFormName}
        onActiveDirChange={setFormActiveDir}
        onDescriptionChange={setFormDescription}
        onSelectFolder={handleSelectFolder}
        onSubmit={handleUpdateSpace}
        isSubmitting={updateSpaceMutation.isPending}
      />

      {/* Clone Space Dialog */}
      <SpaceFormDialog
        open={showCloneDialog}
        onOpenChange={setShowCloneDialog}
        mode="clone"
        name={cloneName}
        activeDir={cloneActiveDir}
        description=""
        onNameChange={setCloneName}
        onActiveDirChange={setCloneActiveDir}
        onDescriptionChange={() => {}}
        onSelectFolder={handleSelectCloneFolder}
        onSubmit={handleCloneSpace}
        isSubmitting={createSpaceMutation.isPending}
        cloneSourceName={selectedSpace?.name}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteSpaceDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        spaceName={selectedSpace?.name || ""}
        onConfirm={handleDeleteSpace}
        isDeleting={deleteSpaceMutation.isPending}
      />

      {/* Manage Skills Dialog */}
      <ManageSkillsDialog
        open={showSkillsDialog}
        onOpenChange={setShowSkillsDialog}
        spaceName={selectedSpace?.name || ""}
        skills={skills}
        visibilityMap={visibilityMap}
        visibleSkillCount={visibleSkillCount}
        onToggleVisibility={handleToggleSkillVisibility}
        onSelectAll={handleSelectAllSkills}
        onDeselectAll={handleDeselectAllSkills}
        isUpdating={setSkillVisibilityMutation.isPending || setBulkVisibilityMutation.isPending}
      />

      {/* Export Dialog */}
      <ExportConfigDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        exportType={exportType}
        config={exportConfig}
        onCopy={handleCopyConfig}
        onSave={handleSaveConfig}
      />
    </>
  );
};
