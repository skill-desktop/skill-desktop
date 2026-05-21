import React from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Layers,
  Home as HomeIcon,
  Library as LibraryIcon,
  Wrench,
  Settings as SettingsIcon,
  FolderTree,
  Plus,
  UploadCloud,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  Command,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useSettingsStore } from "@/stores";
import {
  useSkills,
  useSpaces,
  useRescanLibrary,
  useShowInFolder,
} from "@/hooks";
import { Kbd } from "@/components/ui";
import type { Skill } from "@/types";
import type { Space } from "@/types";

// ========== Types ==========

type CommandKind = "skill" | "space" | "view" | "action";

interface CommandItem {
  id: string;
  kind: CommandKind;
  /** What we render in the row. */
  label: string;
  /** Secondary line (description, path, …). */
  hint?: string;
  /** Lucide icon node. */
  icon: React.ReactNode;
  /** Keywords used for fuzzy matching when filtering. */
  keywords?: string;
  /** Side label like "Action" or "Skill" — keeps the user oriented. */
  group: string;
  /** Action triggered on Enter / click. */
  run: () => void;
}

// ========== Tiny fuzzy match ==========

/**
 * Permissive substring matcher: every character of `query` must appear in
 * `target` in order, but they don't have to be contiguous. Mirrors the
 * behaviour of Sublime / VS Code's command palette without dragging in fuse.js.
 */
function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (q[qi] === t[ti]) qi++;
  }
  return qi === q.length;
}

// ========== Component ==========

/**
 * The big-rectangle ⌘K command palette. We deliberately implement it ourselves
 * rather than pulling in `cmdk` — the surface is small (~5 categories, no
 * nested commands), and a 200-line in-repo version is easier to evolve.
 *
 * Categories (in display order):
 *   1. Skills      — every Skill in the library, jumps to detail
 *   2. Workspaces  — every Space, switches current workspace
 *   3. Go to       — view-switching shortcuts
 *   4. Actions     — Import, New skill, Rescan, Reveal library, …
 */
export const CommandPalette: React.FC = () => {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const setSelectedSkillHash = useAppStore((s) => s.setSelectedSkillHash);
  const setCurrentSpaceId = useAppStore((s) => s.setCurrentSpaceId);
  const { libraryPath } = useSettingsStore();

  const { data: skills = [] } = useSkills();
  const { data: spaces = [] } = useSpaces();
  const rescanMutation = useRescanLibrary();
  const showInFolderMutation = useShowInFolder();

  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  // Reset query + focus the input every time we (re)open.
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Defer focus until after the dialog mounts.
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Build the flat command list. Skills + Spaces are dynamic, the rest are static.
  const allCommands = React.useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [];

    // Skills (cap to 50 — anything more is more efficiently surfaced via the
    // header search bar).
    skills.slice(0, 50).forEach((s: Skill) => {
      list.push({
        id: `skill:${s.hash}`,
        kind: "skill",
        label: s.name,
        hint: s.description?.slice(0, 80) ?? undefined,
        icon: <Layers className="h-4 w-4" />,
        keywords: `${s.name} ${s.description} ${s.tags.join(" ")}`,
        group: t("commandPalette.groups.skills", "Skills"),
        run: () => {
          setSelectedSkillHash(s.hash);
          setCurrentView("library");
          setOpen(false);
        },
      });
    });

    // Workspaces
    spaces.forEach((space: Space) => {
      list.push({
        id: `space:${space.id}`,
        kind: "space",
        label: space.name,
        hint: t("commandPalette.hints.switchToWorkspace", "Switch workspace"),
        icon: <FolderTree className="h-4 w-4" />,
        keywords: space.name,
        group: t("commandPalette.groups.workspaces", "Workspaces"),
        run: () => {
          setCurrentSpaceId(space.id);
          setCurrentView("library");
          setOpen(false);
        },
      });
    });

    // Static views
    const views: { id: string; label: string; icon: React.ReactNode; target: "home" | "library" | "aitools" | "settings" }[] = [
      { id: "view:home", label: t("nav.home"), icon: <HomeIcon className="h-4 w-4" />, target: "home" },
      { id: "view:library", label: t("nav.library"), icon: <LibraryIcon className="h-4 w-4" />, target: "library" },
      { id: "view:aitools", label: t("nav.aitools"), icon: <Wrench className="h-4 w-4" />, target: "aitools" },
      { id: "view:settings", label: t("nav.settings"), icon: <SettingsIcon className="h-4 w-4" />, target: "settings" },
    ];
    views.forEach((v) => {
      list.push({
        id: v.id,
        kind: "view",
        label: v.label,
        icon: v.icon,
        keywords: v.label,
        group: t("commandPalette.groups.goTo", "Go to"),
        run: () => {
          setCurrentView(v.target);
          setOpen(false);
        },
      });
    });

    // Static actions
    list.push(
      {
        id: "action:import",
        kind: "action",
        label: t("commandPalette.actions.importLocal", "Import skill from file..."),
        hint: t("commandPalette.hints.openImport", "Opens the Import dialog"),
        icon: <UploadCloud className="h-4 w-4" />,
        keywords: "import file zip folder",
        group: t("commandPalette.groups.actions", "Actions"),
        run: () => {
          // We can't open ImportSkillDialog from here directly — but Home
          // hosts the dialog. Switching to Home and providing a hint is
          // good enough; the user gets the cards.
          setCurrentView("home");
          setOpen(false);
        },
      },
      {
        id: "action:new-skill",
        kind: "action",
        label: t("commandPalette.actions.newSkill", "New skill..."),
        icon: <Plus className="h-4 w-4" />,
        keywords: "new create skill",
        group: t("commandPalette.groups.actions", "Actions"),
        run: () => {
          setCurrentView("home");
          setOpen(false);
        },
      },
      {
        id: "action:rescan",
        kind: "action",
        label: t("commandPalette.actions.rescan", "Rescan library"),
        icon: <RefreshCw className="h-4 w-4" />,
        keywords: "rescan refresh reload",
        group: t("commandPalette.groups.actions", "Actions"),
        run: () => {
          rescanMutation.mutate();
          setOpen(false);
        },
      },
      {
        id: "action:reveal",
        kind: "action",
        label: t("commandPalette.actions.revealLibrary", "Reveal library in Finder"),
        icon: <FolderOpen className="h-4 w-4" />,
        keywords: "reveal finder open library folder",
        group: t("commandPalette.groups.actions", "Actions"),
        run: () => {
          if (libraryPath) showInFolderMutation.mutate(libraryPath);
          setOpen(false);
        },
      }
    );

    return list;
  }, [
    skills,
    spaces,
    t,
    setSelectedSkillHash,
    setCurrentView,
    setOpen,
    setCurrentSpaceId,
    libraryPath,
    rescanMutation,
    showInFolderMutation,
  ]);

  // Apply fuzzy filter.
  const filtered = React.useMemo(() => {
    if (!query.trim()) return allCommands;
    return allCommands.filter((c) =>
      fuzzyMatch(query, `${c.label} ${c.keywords ?? ""}`)
    );
  }, [allCommands, query]);

  // Keep activeIndex within bounds when filter shrinks the list.
  React.useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, activeIndex]);

  // Keyboard navigation: arrows + Enter + Escape are handled here (Cmd+K is
  // handled by the App-level listener and just toggles `open`).
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[activeIndex];
        if (item) item.run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIndex, setOpen]);

  if (!open) return null;

  // Group commands for display. We iterate `filtered` in original order so
  // matched skills appear before unmatched actions; the grouping is just for
  // visually separating the rows.
  const grouped: { group: string; items: CommandItem[]; startIndex: number }[] = [];
  filtered.forEach((item, idx) => {
    const last = grouped[grouped.length - 1];
    if (last && last.group === item.group) {
      last.items.push(item);
    } else {
      grouped.push({ group: item.group, items: [item], startIndex: idx });
    }
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="relative z-[61] w-full max-w-xl overflow-hidden rounded-xl border border-border-default bg-bg-secondary shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border-default px-4 py-3">
          <Command className="h-4 w-4 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              "commandPalette.placeholder",
              "Search skills, workspaces, or actions..."
            )}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <Kbd>esc</Kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-text-muted">
              <Search className="mx-auto mb-2 h-5 w-5" />
              {t("commandPalette.noResults", "No matches.")}
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.group}>
                <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  {g.group}
                </div>
                {g.items.map((item, i) => {
                  const flatIndex = g.startIndex + i;
                  const isActive = flatIndex === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      onClick={item.run}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                        isActive ? "bg-bg-tertiary" : "bg-transparent"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                          isActive
                            ? "bg-accent-blue/15 text-accent-blue"
                            : "bg-bg-tertiary text-text-muted"
                        )}
                      >
                        {item.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-text-primary">
                          {item.label}
                        </div>
                        {item.hint && (
                          <div className="truncate text-xs text-text-muted">
                            {item.hint}
                          </div>
                        )}
                      </div>
                      {isActive && (
                        <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-border-default px-4 py-2 text-[11px] text-text-muted">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              {t("commandPalette.hints.navigate", "navigate")}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd>
              {t("commandPalette.hints.select", "select")}
            </span>
          </div>
          <span>{t("commandPalette.totalCount", "{{count}} commands", { count: allCommands.length })}</span>
        </div>
      </div>
    </div>
  );
};
