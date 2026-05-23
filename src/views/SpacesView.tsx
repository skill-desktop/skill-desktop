import React from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  SidePanel,
  LoadingSpinner,
  EmptyState,
} from "@/components/ui";
import {
  SpaceListItem,
  SpaceDetail,
  SpaceFormDialog,
  ManageSkillsDialog,
  DeleteSpaceDialog,
} from "@/components/spaces";
import {
  useSpaces,
  useCreateSpace,
  useUpdateSpace,
  useDeleteSpace,
  useSkills,
  useSkillVisibilityMap,
  useSetSkillVisibility,
  useSetBulkSkillVisibility,
} from "@/hooks";
import { useAppStore } from "@/stores";

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

export const SpacesView: React.FC = () => {
  const { t } = useTranslation();
  const { currentSpaceId, setCurrentSpaceId } = useAppStore();
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [showEditDialog, setShowEditDialog] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
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
  const setSkillVisibilityMutation = useSetSkillVisibility();
  const setBulkVisibilityMutation = useSetBulkSkillVisibility();

  // Get visibility map for selected space
  const { data: visibilityMap = {} } = useSkillVisibilityMap(currentSpaceId);

  // Count visible skills. Match backend semantics in `get_visible_skills`: any skill
  // missing from the visibility map defaults to visible. This way, after the user
  // toggles a single skill off, the count for the remaining skills stays correct.
  const visibleSkillCount = React.useMemo(
    () => skills.filter((s) => visibilityMap[s.hash] ?? true).length,
    [skills, visibilityMap]
  );

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

  // Handle skill visibility toggle
  const handleToggleSkillVisibility = async (skillHash: string, isVisible: boolean) => {
    if (!currentSpaceId) return;
    try {
      await setSkillVisibilityMutation.mutateAsync({
        spaceId: currentSpaceId,
        skillHash,
        isVisible,
      });
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
    } catch (error) {
      console.error("Failed to deselect all:", error);
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
    return <LoadingSpinner fullHeight size="lg" />;
  }

  return (
    <>
      <div className="flex h-full">
        <SidePanel
          title={t("spaces.title")}
          actions={
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              data-action="new-space"
              onClick={() => {
                resetForm();
                setShowCreateDialog(true);
              }}
              aria-label={t("spaces.createSpace")}
              title={t("spaces.createSpace")}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          }
        >
          {spaces.map((space) => (
            <SpaceListItem
              key={space.id}
              space={space}
              isSelected={currentSpaceId === space.id}
              totalSkills={skills.length}
              onSelect={() => setCurrentSpaceId(space.id)}
            />
          ))}
        </SidePanel>

        {selectedSpace ? (
          <SpaceDetail
            space={selectedSpace}
            visibleSkillCount={visibleSkillCount}
            totalSkills={skills.length}
            onEdit={openEditDialog}
            onClone={openCloneDialog}
            onDelete={() => setShowDeleteConfirm(true)}
            onManageSkills={() => setShowSkillsDialog(true)}
          />
        ) : (
          <EmptyState
            className="flex-1"
            variant="compact"
            title={t("spaces.selectSpace")}
          />
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
    </>
  );
};
