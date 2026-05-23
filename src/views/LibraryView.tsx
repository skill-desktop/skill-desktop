import React from "react";
import { useTranslation } from "react-i18next";
import { Trash2, X, Loader2, Shield, ShieldAlert, Filter, Folder, FolderPlus, Download, Plus, Import, ArrowUpDown, ArrowUp, ArrowDown, Share2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, useSettingsStore } from "@/stores";
import { useSkills, useSearchSkills, useDeleteSkillsBatch, useQuarantinedSkills, useSetSkillQuarantine, useSpaces, useSetBulkSkillVisibility, useExportSkillsBatch, useExportSkillsBatchJson, useDetectAiTools, useInstallSkillToTool, type InstallTargetKind } from "@/hooks";
import { toast } from "@/components/ui";
import { SkillList, SkillDetail, CreateSkillDialog, ImportSkillDialog } from "@/components/library";
import { WorkspaceSwitcher } from "@/components/spaces";
import {
  Skeleton,
  Button,
  ButtonGroup,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  ScrollArea,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  ConfirmDialog,
  EmptyState,
  Separator,
} from "@/components/ui";
import type { Skill } from "@/types";

type FilterMode = "all" | "quarantined" | "safe";
type SortField = "name" | "createdAt" | "updatedAt";
type SortDirection = "asc" | "desc";

export const LibraryView: React.FC = () => {
  const { t } = useTranslation();
  const { searchQuery, selectedSkillHash, setSelectedSkillHash, setCurrentView } = useAppStore();
  const { libraryPath } = useSettingsStore();
  
  // Selection state for batch operations
  const [selectedHashes, setSelectedHashes] = React.useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [filterMode, setFilterMode] = React.useState<FilterMode>("all");
  const [sortField, setSortField] = React.useState<SortField>("name");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");
  const [showQuarantineConfirm, setShowQuarantineConfirm] = React.useState(false);
  const [showAddToSpaceDialog, setShowAddToSpaceDialog] = React.useState(false);
  const [showCreateSkillDialog, setShowCreateSkillDialog] = React.useState(false);
  const [showImportSkillDialog, setShowImportSkillDialog] = React.useState(false);

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
  const { data: detectedTools = [] } = useDetectAiTools();
  const installMutation = useInstallSkillToTool();
  const [showInstallDialog, setShowInstallDialog] = React.useState(false);
  const [isBatchInstalling, setIsBatchInstalling] = React.useState(false);
  
  // Create a set for faster lookup
  const quarantinedSet = React.useMemo(() => new Set(quarantinedHashes), [quarantinedHashes]);

  // Search skills if there's a query
  const { data: searchResults } = useSearchSkills(searchQuery);

  // Use search results if searching, otherwise use all skills
  // Then apply filter mode and sorting
  const filteredSkills = React.useMemo(() => {
    const baseSkills = searchQuery ? (searchResults || []) : allSkills;
    
    let filtered: Skill[];
    switch (filterMode) {
      case "quarantined":
        filtered = baseSkills.filter(s => quarantinedSet.has(s.hash));
        break;
      case "safe":
        filtered = baseSkills.filter(s => !quarantinedSet.has(s.hash));
        break;
      default:
        filtered = [...baseSkills];
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "createdAt":
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "updatedAt":
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    
    return filtered;
  }, [searchQuery, searchResults, allSkills, filterMode, quarantinedSet, sortField, sortDirection]);
  
  const skills = filteredSkills;
  
  // Handle sort field change
  const handleSortChange = (field: SortField) => {
    if (field === sortField) {
      // Toggle direction if same field
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      // Default to descending for time fields, ascending for name
      setSortDirection(field === "name" ? "asc" : "desc");
    }
  };
  
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
      await deleteSkillsBatchMutation.mutateAsync(Array.from(selectedHashes));
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
        default_name: `skills-export-${new Date().toISOString().split("T")[0]}.md`,
        filter_name: "Markdown",
        filter_extensions: ["md"],
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
        default_name: `skills-export-${new Date().toISOString().split("T")[0]}.json`,
        filter_name: "JSON",
        filter_extensions: ["json"],
      });
      
      setShowExportDialog(false);
      cancelSelectionMode();
    } catch (error) {
      console.error("Failed to export skills:", error);
    }
  };

  /**
   * Batch-install every selected skill into the chosen AI tool. Failures
   * accumulate but never abort the loop — we want partial success to be
   * "most skills made it, n failed", not "first failure stops everything".
   */
  const handleBatchInstallTo = async (kind: InstallTargetKind, label: string) => {
    if (selectedHashes.size === 0) return;
    const hashesArr = Array.from(selectedHashes);
    // Map from skill hash → skill_id (the install API takes the latter).
    const skillIds = hashesArr
      .map((h) => allSkills.find((s) => s.hash === h)?.skillId)
      .filter((id): id is string => !!id);

    setIsBatchInstalling(true);
    let ok = 0;
    let fail = 0;
    for (const skillId of skillIds) {
      try {
        await installMutation.mutateAsync({ skillId, targetKind: kind });
        ok++;
      } catch (e) {
        fail++;
      }
    }
    setIsBatchInstalling(false);
    setShowInstallDialog(false);
    cancelSelectionMode();

    if (ok > 0) {
      toast.success(
        t("library.batchInstall.successToast", { count: ok, tool: label }),
        fail > 0
          ? t("library.batchInstall.partialFailed", { count: fail })
          : undefined
      );
    } else if (fail > 0) {
      toast.error(t("library.batchInstall.allFailed", { tool: label }));
    }
  };

  if (!libraryPath) {
    return (
      <EmptyState
        icon={<Folder className="h-10 w-10" />}
        title={t("library.noLibraryPath")}
        description={t("library.noLibraryPathDesc")}
        action={
          <Button onClick={() => setCurrentView("settings")}>
            {t("library.goToSettings")}
          </Button>
        }
      />
    );
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        variant="error"
        icon={<ShieldAlert className="h-10 w-10" />}
        title={t("library.failedToLoad")}
        description={String(error)}
      />
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        {!selectionMode && (
          <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border-default bg-bg-secondary px-4">
            <div className="flex items-center gap-2">
              <WorkspaceSwitcher
                onManageWorkspaces={() => setCurrentView("spaces")}
              />
              <Filter className="ml-2 h-3.5 w-3.5 text-text-muted" />
              <ButtonGroup>
                <Button
                  variant={filterMode === "all" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setFilterMode("all")}
                >
                  {t("library.filter.all")}
                  <span className="ml-1 text-text-muted tabular-nums">
                    {allSkills.length}
                  </span>
                </Button>
                <Button
                  variant={filterMode === "safe" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setFilterMode("safe")}
                >
                  <Shield className="mr-1 h-3.5 w-3.5" />
                  {t("library.filter.safe")}
                  <span className="ml-1 text-text-muted tabular-nums">
                    {allSkills.length - quarantinedCount}
                  </span>
                </Button>
                <Button
                  variant={filterMode === "quarantined" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setFilterMode("quarantined")}
                >
                  <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                  {t("library.filter.quarantine")}
                  <span className="ml-1 text-text-muted tabular-nums">
                    {quarantinedCount}
                  </span>
                </Button>
              </ButtonGroup>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" />
                    {t("library.sort.label")}
                    {sortDirection === "asc" ? (
                      <ArrowUp className="ml-1 h-3 w-3" />
                    ) : (
                      <ArrowDown className="ml-1 h-3 w-3" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleSortChange("name")}
                    className={sortField === "name" ? "bg-bg-tertiary" : ""}
                  >
                    {t("library.sort.name")}
                    {sortField === "name" &&
                      (sortDirection === "asc" ? (
                        <ArrowUp className="ml-auto h-3 w-3" />
                      ) : (
                        <ArrowDown className="ml-auto h-3 w-3" />
                      ))}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleSortChange("createdAt")}
                    className={sortField === "createdAt" ? "bg-bg-tertiary" : ""}
                  >
                    {t("library.sort.createdAt")}
                    {sortField === "createdAt" &&
                      (sortDirection === "asc" ? (
                        <ArrowUp className="ml-auto h-3 w-3" />
                      ) : (
                        <ArrowDown className="ml-auto h-3 w-3" />
                      ))}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleSortChange("updatedAt")}
                    className={sortField === "updatedAt" ? "bg-bg-tertiary" : ""}
                  >
                    {t("library.sort.updatedAt")}
                    {sortField === "updatedAt" &&
                      (sortDirection === "asc" ? (
                        <ArrowUp className="ml-auto h-3 w-3" />
                      ) : (
                        <ArrowDown className="ml-auto h-3 w-3" />
                      ))}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Separator orientation="vertical" className="h-5" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportSkillDialog(true)}
              >
                <Import className="mr-1.5 h-3.5 w-3.5" />
                {t("library.importSkill")}
              </Button>
              <Button size="sm" onClick={() => setShowCreateSkillDialog(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("library.createSkill")}
              </Button>
            </div>
          </div>
        )}

        {selectionMode && (
          <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border-default bg-accent-blue/10 px-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-text-primary">
                {t("library.selection.selected", { count: selectedHashes.size })}
              </span>
              <Separator orientation="vertical" className="h-4" />
              <ButtonGroup>
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  {t("common.selectAll")}
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAll}>
                  {t("common.deselectAll")}
                </Button>
              </ButtonGroup>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowInstallDialog(true)}
                disabled={selectedHashes.size === 0 || detectedTools.length === 0}
              >
                <Share2 className="mr-1.5 h-3.5 w-3.5" />
                {t("library.selection.install")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddToSpaceDialog(true)}
                disabled={selectedHashes.size === 0 || spaces.length === 0}
              >
                <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                {t("library.selection.addToSpace")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowExportDialog(true)}
                disabled={selectedHashes.size === 0}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t("library.selection.export")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowQuarantineConfirm(true)}
                disabled={selectedHashes.size === 0}
              >
                <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
                {t("library.selection.quarantine")}
              </Button>
              <Separator orientation="vertical" className="h-5" />
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={selectedHashes.size === 0}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t("library.selection.delete")} ({selectedHashes.size})
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelSelectionMode}>
                <X className="mr-1.5 h-3.5 w-3.5" />
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

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t("library.deleteConfirm.title", { count: selectedHashes.size })}
        description={t("library.deleteConfirm.description", { count: selectedHashes.size })}
        tone="danger"
        confirmLabel={t("common.delete")}
        confirmIcon={<Trash2 className="h-3.5 w-3.5" />}
        cancelLabel={t("common.cancel")}
        isPending={deleteSkillsBatchMutation.isPending}
        onConfirm={handleBatchDelete}
      />

      {/* Quarantine confirm — two-button confirm. Custom because the dialog needs
          a tri-state result (mark safe / mark quarantined / cancel), so the
          generic ConfirmDialog wouldn't cleanly fit. */}
      <Dialog open={showQuarantineConfirm} onOpenChange={setShowQuarantineConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("library.quarantineConfirm.title", { count: selectedHashes.size })}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleBatchQuarantine(false)}
              disabled={setQuarantineMutation.isPending}
            >
              <Shield className="mr-1.5 h-3.5 w-3.5" />
              {t("library.quarantineConfirm.markAsSafe")}
            </Button>
            <Button
              size="sm"
              onClick={() => handleBatchQuarantine(true)}
              disabled={setQuarantineMutation.isPending}
            >
              {setQuarantineMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
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

      {/* Batch install dialog — pick which AI tool to symlink every selected
          skill into. We only show detected/exists tools because installing
          to a missing dir would fail loudly on the backend. */}
      <Dialog open={showInstallDialog} onOpenChange={setShowInstallDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("library.batchInstall.title", { count: selectedHashes.size })}
            </DialogTitle>
            <DialogDescription>
              {t("library.batchInstall.description")}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-1 py-2">
              {detectedTools
                .filter((tool) => tool.exists && tool.kind !== "agents")
                .map((tool) => (
                  <button
                    key={tool.kind}
                    type="button"
                    onClick={() =>
                      void handleBatchInstallTo(
                        tool.kind as InstallTargetKind,
                        tool.label
                      )
                    }
                    disabled={isBatchInstalling}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-blue/10 text-accent-blue">
                      <Share2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="font-medium">{tool.label}</div>
                      <div className="truncate font-mono text-[10px] text-text-muted">
                        {tool.path}
                      </div>
                    </div>
                    {isBatchInstalling && (
                      <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                    )}
                  </button>
                ))}
              {detectedTools.filter((t) => t.exists && t.kind !== "agents")
                .length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-text-muted">
                  {t("library.batchInstall.noTools")}
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowInstallDialog(false)}
              disabled={isBatchInstalling}
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

      {/* Import Skill Dialog */}
      <ImportSkillDialog
        open={showImportSkillDialog}
        onOpenChange={setShowImportSkillDialog}
      />
    </>
  );
};
