import React from "react";
import { useTranslation } from "react-i18next";
import { Trash2, X, Loader2, Shield, ShieldAlert, Filter, Folder, FolderPlus, Download, Plus, BookOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, useSettingsStore } from "@/stores";
import { useSkills, useSearchSkills, useDeleteSkillsBatch, useQuarantinedSkills, useSetSkillQuarantine, useSpaces, useSetBulkSkillVisibility, useExportSkillsBatch, useExportSkillsBatchJson } from "@/hooks";
import { SkillList, SkillDetail, CreateSkillDialog, ExampleSkillsDialog } from "@/components/library";
import { Skeleton, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, ScrollArea } from "@/components/ui";
import type { Skill } from "@/types";

type FilterMode = "all" | "quarantined" | "safe";

export const LibraryView: React.FC = () => {
  const { t } = useTranslation();
  const { searchQuery, selectedSkillHash, setSelectedSkillHash, setCurrentView } = useAppStore();
  const { libraryPath } = useSettingsStore();
  
  // Selection state for batch operations
  const [selectedHashes, setSelectedHashes] = React.useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [filterMode, setFilterMode] = React.useState<FilterMode>("all");
  const [showQuarantineConfirm, setShowQuarantineConfirm] = React.useState(false);
  const [showAddToSpaceDialog, setShowAddToSpaceDialog] = React.useState(false);
  const [showCreateSkillDialog, setShowCreateSkillDialog] = React.useState(false);
  const [showExampleSkillsDialog, setShowExampleSkillsDialog] = React.useState(false);

  // Fetch skills from backend
  const { data: allSkills = [], isLoading, error } = useSkills();
  const deleteSkillsBatchMutation = useDeleteSkillsBatch();
  const { data: quarantinedHashes = [] } = useQuarantinedSkills();
  const setQuarantineMutation = useSetSkillQuarantine();
  const { data: spaces = [] } = useSpaces();
  const setBulkVisibilityMutation = useSetBulkSkillVisibility();
  const exportBatchMutation = useExportSkillsBatch();
  const exportBatchJsonMutation = useExportSkillsBatchJson();
  const [showExportDialog, setShowExportDialog] = React.useState(false);
  
  // Create a set for faster lookup
  const quarantinedSet = React.useMemo(() => new Set(quarantinedHashes), [quarantinedHashes]);

  // Search skills if there's a query
  const { data: searchResults } = useSearchSkills(searchQuery);

  // Use search results if searching, otherwise use all skills
  // Then apply filter mode
  const filteredSkills = React.useMemo(() => {
    const baseSkills = searchQuery ? (searchResults || []) : allSkills;
    
    switch (filterMode) {
      case "quarantined":
        return baseSkills.filter(s => quarantinedSet.has(s.hash));
      case "safe":
        return baseSkills.filter(s => !quarantinedSet.has(s.hash));
      default:
        return baseSkills;
    }
  }, [searchQuery, searchResults, allSkills, filterMode, quarantinedSet]);
  
  const skills = filteredSkills;
  
  // Count quarantined skills
  const quarantinedCount = allSkills.filter(s => quarantinedSet.has(s.hash)).length;

  // Find selected skill
  const selectedSkill = React.useMemo(() => {
    if (!selectedSkillHash) return null;
    return allSkills.find((s: Skill) => s.hash === selectedSkillHash) || null;
  }, [selectedSkillHash, allSkills]);

  // Toggle selection for a skill
  const toggleSelection = (hash: string) => {
    const newSelected = new Set(selectedHashes);
    if (newSelected.has(hash)) {
      newSelected.delete(hash);
    } else {
      newSelected.add(hash);
    }
    setSelectedHashes(newSelected);
  };

  // Select all visible skills
  const selectAll = () => {
    setSelectedHashes(new Set(skills.map(s => s.hash)));
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedHashes(new Set());
  };

  // Cancel selection mode
  const cancelSelectionMode = () => {
    setSelectionMode(false);
    setSelectedHashes(new Set());
  };

  // Handle batch delete
  const handleBatchDelete = async () => {
    if (selectedHashes.size === 0) return;
    
    try {
      const result = await deleteSkillsBatchMutation.mutateAsync(Array.from(selectedHashes));
      console.log("Batch delete result:", result);
      setShowDeleteConfirm(false);
      cancelSelectionMode();
      // Clear selection if the selected skill was deleted
      if (selectedSkillHash && selectedHashes.has(selectedSkillHash)) {
        setSelectedSkillHash(null);
      }
    } catch (error) {
      console.error("Failed to delete skills:", error);
    }
  };

  // Handle batch quarantine
  const handleBatchQuarantine = async (quarantine: boolean) => {
    if (selectedHashes.size === 0) return;
    
    try {
      for (const hash of selectedHashes) {
        await setQuarantineMutation.mutateAsync({ hash, isQuarantined: quarantine });
      }
      setShowQuarantineConfirm(false);
      cancelSelectionMode();
    } catch (error) {
      console.error("Failed to quarantine skills:", error);
    }
  };

  // Handle batch add to space
  const handleBatchAddToSpace = async (spaceId: string) => {
    if (selectedHashes.size === 0) return;
    
    try {
      await setBulkVisibilityMutation.mutateAsync({
        spaceId,
        skillHashes: Array.from(selectedHashes),
        isVisible: true,
      });
      setShowAddToSpaceDialog(false);
      cancelSelectionMode();
    } catch (error) {
      console.error("Failed to add skills to space:", error);
    }
  };

  // Handle batch export as Markdown
  const handleBatchExportMarkdown = async () => {
    if (selectedHashes.size === 0) return;
    
    try {
      const content = await exportBatchMutation.mutateAsync(Array.from(selectedHashes));
      
      // Use custom Tauri command for file save with dialog
      await invoke<string | null>("save_file_with_dialog", {
        content,
        defaultName: `skills-export-${new Date().toISOString().split("T")[0]}.md`,
        filterName: "Markdown",
        filterExtensions: ["md"],
      });
      
      setShowExportDialog(false);
      cancelSelectionMode();
    } catch (error) {
      console.error("Failed to export skills:", error);
    }
  };

  // Handle batch export as JSON
  const handleBatchExportJson = async () => {
    if (selectedHashes.size === 0) return;
    
    try {
      const content = await exportBatchJsonMutation.mutateAsync(Array.from(selectedHashes));
      
      // Use custom Tauri command for file save with dialog
      await invoke<string | null>("save_file_with_dialog", {
        content,
        defaultName: `skills-export-${new Date().toISOString().split("T")[0]}.json`,
        filterName: "JSON",
        filterExtensions: ["json"],
      });
      
      setShowExportDialog(false);
      cancelSelectionMode();
    } catch (error) {
      console.error("Failed to export skills:", error);
    }
  };

  // Show empty state if no library path is set
  if (!libraryPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-bg-tertiary mb-6">
          <Folder className="h-10 w-10 text-text-muted" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">{t("library.noLibraryPath")}</h3>
        <p className="text-sm text-text-muted max-w-sm mb-6">
          {t("library.noLibraryPathDesc")}
        </p>
        <Button onClick={() => setCurrentView("settings")}>
          {t("library.goToSettings")}
        </Button>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-full">
        <div className="flex-1 p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-sm">{t("library.failedToLoad")}</p>
        <p className="text-xs mt-1">{String(error)}</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Filter toolbar */}
        {!selectionMode && (
          <div className="flex items-center justify-between border-b border-border-default bg-bg-secondary px-4 py-2">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-text-muted" />
              <div className="flex items-center gap-1">
                <Button
                  variant={filterMode === "all" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setFilterMode("all")}
                >
                  {t("library.filter.all")} ({allSkills.length})
                </Button>
                <Button
                  variant={filterMode === "safe" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setFilterMode("safe")}
                >
                  <Shield className="h-3.5 w-3.5 mr-1" />
                  {t("library.filter.safe")} ({allSkills.length - quarantinedCount})
                </Button>
                <Button
                  variant={filterMode === "quarantined" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setFilterMode("quarantined")}
                >
                  <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                  {t("library.filter.quarantine")} ({quarantinedCount})
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExampleSkillsDialog(true)}
              >
                <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                {t("library.exampleSkills")}
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCreateSkillDialog(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t("library.createSkill")}
              </Button>
            </div>
          </div>
        )}
        
        {/* Batch operation toolbar */}
        {selectionMode && (
          <div className="flex items-center justify-between border-b border-border-default bg-bg-tertiary px-4 py-2">
            <div className="flex items-center gap-4">
              <span className="text-sm text-text-primary">
                {t("library.selection.selected", { count: selectedHashes.size })}
              </span>
              <Button variant="ghost" size="sm" onClick={selectAll}>
                {t("common.selectAll")}
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAll}>
                {t("common.deselectAll")}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddToSpaceDialog(true)}
                disabled={selectedHashes.size === 0 || spaces.length === 0}
              >
                <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
                {t("library.selection.addToSpace")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowExportDialog(true)}
                disabled={selectedHashes.size === 0}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {t("library.selection.export")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowQuarantineConfirm(true)}
                disabled={selectedHashes.size === 0}
              >
                <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
                {t("library.selection.quarantine")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={selectedHashes.size === 0}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {t("library.selection.delete")} ({selectedHashes.size})
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelSelectionMode}>
                <X className="h-3.5 w-3.5 mr-1.5" />
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Skill list */}
          <div className="flex-1 overflow-hidden">
            <SkillList 
              skills={skills} 
              selectionMode={selectionMode}
              selectedHashes={selectedHashes}
              onToggleSelection={toggleSelection}
              onEnterSelectionMode={() => setSelectionMode(true)}
              quarantinedHashes={quarantinedSet}
            />
          </div>

          {/* Detail panel */}
          <SkillDetail skill={selectedSkill} />
        </div>
      </div>

      {/* Batch Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("library.deleteConfirm.title", { count: selectedHashes.size })}</DialogTitle>
            <DialogDescription>
              {t("library.deleteConfirm.description", { count: selectedHashes.size })}
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
              onClick={handleBatchDelete}
              disabled={deleteSkillsBatchMutation.isPending}
            >
              {deleteSkillsBatchMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quarantine Confirmation Dialog */}
      <Dialog open={showQuarantineConfirm} onOpenChange={setShowQuarantineConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("library.quarantineConfirm.title", { count: selectedHashes.size })}</DialogTitle>
            <DialogDescription>
              {t("library.quarantineConfirm.description", { count: selectedHashes.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleBatchQuarantine(false)}
              disabled={setQuarantineMutation.isPending}
            >
              <Shield className="h-3.5 w-3.5 mr-1.5" />
              {t("library.quarantineConfirm.markAsSafe")}
            </Button>
            <Button
              size="sm"
              onClick={() => handleBatchQuarantine(true)}
              disabled={setQuarantineMutation.isPending}
            >
              {setQuarantineMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t("library.selection.quarantine")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Space Dialog */}
      <Dialog open={showAddToSpaceDialog} onOpenChange={setShowAddToSpaceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("library.addToSpace.title")}</DialogTitle>
            <DialogDescription>
              {t("library.addToSpace.description", { count: selectedHashes.size })}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-1 py-2">
              {spaces.map((space) => (
                <button
                  key={space.id}
                  onClick={() => handleBatchAddToSpace(space.id)}
                  disabled={setBulkVisibilityMutation.isPending}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-50"
                >
                  <Folder className="h-4 w-4 text-text-muted" />
                  <span className="flex-1 text-left truncate">{space.name}</span>
                  {space.description && (
                    <span className="text-xs text-text-muted truncate max-w-[150px]">
                      {space.description}
                    </span>
                  )}
                </button>
              ))}
              {spaces.length === 0 && (
                <div className="text-center py-4 text-sm text-text-muted">
                  {t("library.addToSpace.noSpaces")}
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAddToSpaceDialog(false)}
            >
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("library.export.title")}</DialogTitle>
            <DialogDescription>
              {t("library.export.description", { count: selectedHashes.size })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Button
              variant="secondary"
              className="w-full justify-start"
              onClick={handleBatchExportMarkdown}
              disabled={exportBatchMutation.isPending}
            >
              {exportBatchMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {t("library.export.asMarkdown")}
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              onClick={handleBatchExportJson}
              disabled={exportBatchJsonMutation.isPending}
            >
              {exportBatchJsonMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {t("library.export.asJson")}
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowExportDialog(false)}
            >
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Skill Dialog */}
      <CreateSkillDialog
        open={showCreateSkillDialog}
        onOpenChange={setShowCreateSkillDialog}
      />

      {/* Example Skills Dialog */}
      <ExampleSkillsDialog
        open={showExampleSkillsDialog}
        onOpenChange={setShowExampleSkillsDialog}
      />
    </>
  );
};
