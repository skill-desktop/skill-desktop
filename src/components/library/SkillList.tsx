import React from "react";
import { useTranslation } from "react-i18next";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useSettingsStore } from "@/stores";
import {
  ScrollArea,
  Button,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui";
import { useShowInFolder } from "@/hooks";
import { toast } from "@/components/ui";
import { SkillCard } from "./SkillCard";
import { SkillListItem } from "./SkillListItem";
import type { Skill } from "@/types";

interface SkillListProps {
  skills: Skill[];
  visibilityMap?: Record<string, boolean>;
  onVisibilityChange?: (skillHash: string, visible: boolean) => void;
  // Selection mode props
  selectionMode?: boolean;
  selectedHashes?: Set<string>;
  onToggleSelection?: (hash: string) => void;
  onEnterSelectionMode?: () => void;
  // Quarantine props
  quarantinedHashes?: Set<string>;
}

/**
 * Tree node for the directory-based grouping. Each node represents either a
 * subdirectory under the library root or the library root itself. Skills are
 * grouped by the parent directory of their `skill_id` (e.g. a skill with
 * id="research/web-search" lives directly inside the "research" folder node).
 */
interface TreeNode {
  /** Folder path relative to library root (e.g. "", "research", "research/deep"). */
  path: string;
  /** Last path segment for display (e.g. "research", "deep"). Empty for root. */
  name: string;
  /** Direct child folders, keyed by segment name (sorted alphabetically when rendered). */
  folders: Map<string, TreeNode>;
  /** Skills sitting directly inside this folder (NOT in any subfolder). */
  skills: Skill[];
}

function createNode(path: string, name: string): TreeNode {
  return { path, name, folders: new Map(), skills: [] };
}

/**
 * Build a directory tree from a flat list of skills. `skill_id` is the relative
 * path from library root to the skill directory; we use everything *except* the
 * last segment as the parent folder chain.
 */
function buildTree(skills: Skill[]): TreeNode {
  const root = createNode("", "");

  for (const skill of skills) {
    // `skill_id` looks like "web-search" (top-level) or "research/deep/skill-x"
    // (nested). Empty/missing skill_id (rare, only for skills outside library
    // root) falls back to the skill's directory basename so it still groups
    // under SOMETHING rather than disappearing.
    const id = skill.skillId || skill.name;
    const parts = id.split("/").filter(Boolean);

    // `parts` should always be at least 1 (the skill directory name itself).
    // Everything before the last segment is the parent folder chain.
    const folderParts = parts.length > 1 ? parts.slice(0, -1) : [];

    let current = root;
    let accumulated = "";
    for (const segment of folderParts) {
      accumulated = accumulated ? `${accumulated}/${segment}` : segment;
      let next = current.folders.get(segment);
      if (!next) {
        next = createNode(accumulated, segment);
        current.folders.set(segment, next);
      }
      current = next;
    }
    current.skills.push(skill);
  }

  return root;
}

/** Count every skill under `node` (recursively). */
function countSkills(node: TreeNode): number {
  let total = node.skills.length;
  for (const child of node.folders.values()) {
    total += countSkills(child);
  }
  return total;
}

/** Collect every folder path in the tree, used for the "expand all" default. */
function collectAllPaths(node: TreeNode, into: Set<string>): void {
  for (const child of node.folders.values()) {
    into.add(child.path);
    collectAllPaths(child, into);
  }
}

export const SkillList: React.FC<SkillListProps> = ({
  skills,
  visibilityMap,
  onVisibilityChange,
  selectionMode = false,
  selectedHashes = new Set(),
  onToggleSelection,
  onEnterSelectionMode,
  quarantinedHashes = new Set(),
}) => {
  const { t } = useTranslation();
  const { viewMode, libraryPath } = useSettingsStore();
  const showInFolder = useShowInFolder();

  const tree = React.useMemo(() => buildTree(skills), [skills]);

  // Every folder path that currently exists in the tree (snapshot).
  const allPaths = React.useMemo(() => {
    const s = new Set<string>();
    collectAllPaths(tree, s);
    return s;
  }, [tree]);

  // Top-level folder paths only — what we open by default for larger libraries.
  const topLevelPaths = React.useMemo(() => {
    const s = new Set<string>();
    for (const f of tree.folders.values()) s.add(f.path);
    return s;
  }, [tree]);

  // Stable "shape signature" so we only re-seed expansion when the set of
  // folders actually changes (rename / add / remove) — NOT when an open
  // folder gains or loses a skill.
  const shapeSignature = React.useMemo(
    () => Array.from(allPaths).sort().join("|"),
    [allPaths]
  );

  // Expanded folder paths. We start with a sensible default and then
  // preserve user choices across re-renders for folders that still exist.
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    return skills.length < 80 ? new Set(allPaths) : new Set(topLevelPaths);
    // We deliberately rely on the initial render values; subsequent shape
    // changes are handled in the effect below to merge user choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // Reconcile `expanded` against the tree's current shape: drop stale paths,
  // and ensure newly-discovered top-level folders are visible by default.
  // We do NOT auto-collapse folders the user opened.
  React.useEffect(() => {
    setExpanded((prev) => {
      const next = new Set<string>();
      // 1. Keep every previously-expanded folder that still exists.
      for (const p of prev) {
        if (allPaths.has(p)) next.add(p);
      }
      // 2. Auto-expand based on library size.
      if (skills.length < 80) {
        // Small library: every folder is visible.
        for (const p of allPaths) next.add(p);
      } else {
        // Large library: at least the top-level is visible so the user has
        // an entry point. They can drill into subfolders as needed.
        for (const p of topLevelPaths) next.add(p);
      }
      return next;
    });
    // shapeSignature is the canonical "the shape changed" signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeSignature, skills.length]);

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(allPaths));
  const collapseAll = () => setExpanded(new Set());

  if (skills.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        <div className="mb-4 text-4xl">📭</div>
        <p className="text-sm">{t("common.noData")}</p>
      </div>
    );
  }

  const renderSkill = (skill: Skill) =>
    viewMode === "grid" ? (
      <SkillCard
        key={skill.hash}
        skill={skill}
        isVisible={visibilityMap?.[skill.hash] ?? true}
        onVisibilityChange={
          onVisibilityChange
            ? (visible) => onVisibilityChange(skill.hash, visible)
            : undefined
        }
        selectionMode={selectionMode}
        isSelected={selectedHashes.has(skill.hash)}
        onToggleSelection={onToggleSelection}
        isQuarantined={quarantinedHashes.has(skill.hash)}
      />
    ) : (
      <SkillListItem
        key={skill.hash}
        skill={skill}
        isVisible={visibilityMap?.[skill.hash] ?? true}
        onVisibilityChange={
          onVisibilityChange
            ? (visible) => onVisibilityChange(skill.hash, visible)
            : undefined
        }
        selectionMode={selectionMode}
        isSelected={selectedHashes.has(skill.hash)}
        onToggleSelection={onToggleSelection}
        isQuarantined={quarantinedHashes.has(skill.hash)}
      />
    );

  // Open a folder in the OS file manager. Resolves to `<library>/<folder.path>`
  // so the user can drag files in / out using their native tools. Errors are
  // surfaced via toast so a missing/renamed directory doesn't silently fail
  // (previously the click would do nothing and the user wouldn't know why).
  const handleOpenFolderInFinder = (folderPath: string) => {
    if (!libraryPath) return;
    const sep = libraryPath.endsWith("/") || libraryPath.endsWith("\\") ? "" : "/";
    const absolute = `${libraryPath}${sep}${folderPath}`;
    showInFolder.mutate(absolute, {
      onError: (err) => {
        toast.error(
          t("contextMenu.showInFolder"),
          err instanceof Error ? err.message : String(err)
        );
      },
    });
  };

  const hasFolders = tree.folders.size > 0;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        {/* Toolbar: per-list quick actions. Only relevant when there's an
            actual tree to operate on (no folders = nothing to expand). */}
        {(hasFolders || (onEnterSelectionMode && !selectionMode)) && (
          <div className="flex items-center justify-end gap-1">
            {hasFolders && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={expandAll}
                  title={t("library.tree.expandAll")}
                  aria-label={t("library.tree.expandAll")}
                >
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={collapseAll}
                  title={t("library.tree.collapseAll")}
                  aria-label={t("library.tree.collapseAll")}
                >
                  <ChevronsDownUp className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {onEnterSelectionMode && !selectionMode && skills.length > 0 && (
              <Button variant="ghost" size="sm" onClick={onEnterSelectionMode}>
                <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
                {t("common.selectAll")}
              </Button>
            )}
          </div>
        )}

        <TreeView
          node={tree}
          depth={0}
          expanded={expanded}
          onToggle={toggleFolder}
          onOpenFolderInFinder={handleOpenFolderInFinder}
          canOpenInFinder={!!libraryPath}
          renderSkill={renderSkill}
          viewMode={viewMode}
          isRoot
        />
      </div>
    </ScrollArea>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Tree renderer
// ──────────────────────────────────────────────────────────────────────────────

interface TreeViewProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpenFolderInFinder: (folderPath: string) => void;
  canOpenInFinder: boolean;
  renderSkill: (skill: Skill) => React.ReactNode;
  viewMode: "grid" | "list";
  /** Root call: skip the folder header / chevron and render children directly. */
  isRoot?: boolean;
}

const TreeView: React.FC<TreeViewProps> = ({
  node,
  depth,
  expanded,
  onToggle,
  onOpenFolderInFinder,
  canOpenInFinder,
  renderSkill,
  viewMode,
  isRoot = false,
}) => {
  const { t } = useTranslation();

  const folders = React.useMemo(
    () =>
      Array.from(node.folders.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [node.folders]
  );
  const skills = React.useMemo(
    () => [...node.skills].sort((a, b) => a.name.localeCompare(b.name)),
    [node.skills]
  );

  // Empty body protection: if the node has no skills and no folders, render
  // nothing (this only happens for an empty library at depth 0, which the
  // parent already handles with an empty state).
  if (folders.length === 0 && skills.length === 0) {
    return null;
  }

  // Layout for the skill rows. Grid stays grid; list stays list. The same
  // wrapper is used at every tree depth so visual hierarchy is consistent.
  const skillsWrapperClass =
    viewMode === "grid"
      ? "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4"
      : "space-y-1";

  return (
    <div className={isRoot ? "space-y-4" : "space-y-2"}>
      {/* Subfolders, rendered as collapsible groups. Each folder header is
          a right-clickable surface — "Open in Finder" lets the user jump
          straight to the directory on disk. */}
      {folders.map((folder) => {
        const isOpen = expanded.has(folder.path);
        const totalCount = countSkills(folder);
        return (
          <div key={folder.path} className="space-y-2">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => onToggle(folder.path)}
                  className="group flex w-full items-center gap-1.5 rounded-md py-1 text-left text-text-secondary transition-colors hover:text-text-primary"
                  title={folder.path}
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {isOpen ? (
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-accent-blue" />
                  ) : (
                    <Folder className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                  )}
                  <span className="truncate text-sm font-semibold">
                    {folder.name}
                  </span>
                  <span className="text-xs tabular-nums text-text-muted">
                    ({totalCount})
                  </span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onClick={() => onToggle(folder.path)}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {isOpen
                    ? t("library.tree.collapse")
                    : t("library.tree.expand")}
                </ContextMenuItem>
                {canOpenInFinder && (
                  <ContextMenuItem
                    onClick={() => onOpenFolderInFinder(folder.path)}
                  >
                    <FolderOpen className="h-4 w-4" />
                    {t("contextMenu.showInFolder")}
                  </ContextMenuItem>
                )}
              </ContextMenuContent>
            </ContextMenu>

            {isOpen && (
              <div
                className="space-y-2 border-l border-border-muted pl-3"
                style={{ marginLeft: `${Math.min(depth, 4) * 4}px` }}
              >
                <TreeView
                  node={folder}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggle={onToggle}
                  onOpenFolderInFinder={onOpenFolderInFinder}
                  canOpenInFinder={canOpenInFinder}
                  renderSkill={renderSkill}
                  viewMode={viewMode}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Skills directly under this node. Rendered after subfolders so
          folders read like a directory listing in Finder. */}
      {skills.length > 0 && (
        <div className={skillsWrapperClass}>
          {skills.map((skill) => renderSkill(skill))}
        </div>
      )}
    </div>
  );
};
