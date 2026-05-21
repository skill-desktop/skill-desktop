import React from "react";
import { useTranslation } from "react-i18next";
import { Search, RefreshCw, LayoutGrid, List, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useSettingsStore } from "@/stores";
import { useRescanLibrary, useSkills } from "@/hooks";
import { Button, Input, Kbd } from "@/components/ui";

/**
 * iOS-style two-row "Large Title" header.
 *
 * Top row: an always-visible 36px utility bar with the search, view toggle,
 *          and rescan button. Tight, ignorable, comparable to iOS' compact
 *          nav bar when scrolled.
 *
 * Bottom row: a 56px hero band showing the *large* page title (24pt) plus a
 *             one-line subtitle that adapts per-view ("127 in your library",
 *             "Manage how skills reach your AI tools", etc).
 *
 * On the Home view we hide the hero band entirely — HomeView already renders
 * its own tagline as a 3xl h1, so the header would just be redundant.
 */
export const Header: React.FC = () => {
  const { t } = useTranslation();
  const { currentView, searchQuery, setSearchQuery } = useAppStore();
  const { viewMode, setViewMode, libraryPath } = useSettingsStore();
  const rescanMutation = useRescanLibrary();
  const { data: skills = [] } = useSkills();

  const titleFor = (v: typeof currentView) => {
    switch (v) {
      case "home":
        return t("nav.home");
      case "library":
        return t("nav.library");
      case "spaces":
        return t("nav.spaces");
      case "sandbox":
        return t("nav.sandbox");
      case "aitools":
        return t("nav.aitools");
      case "settings":
        return t("nav.settings");
      default:
        return t("app.name");
    }
  };

  const subtitleFor = (v: typeof currentView): string | null => {
    switch (v) {
      case "library":
        return t("header.subtitle.library", {
          count: skills.length,
          defaultValue: "{{count}} skills in your library",
        });
      case "spaces":
        return t("header.subtitle.spaces", {
          defaultValue: "Organize skills into per-project workspaces.",
        });
      case "sandbox":
        return t("header.subtitle.sandbox", {
          defaultValue: "Run skill scripts in isolation.",
        });
      case "aitools":
        return t("header.subtitle.aitools", {
          defaultValue: "Manage how skills reach your AI tools.",
        });
      case "settings":
        return t("header.subtitle.settings", {
          defaultValue: "Preferences, paths, and integrations.",
        });
      default:
        return null;
    }
  };

  const handleRescan = async () => {
    if (!libraryPath) return;
    try {
      await rescanMutation.mutateAsync();
    } catch (error) {
      console.error("Failed to rescan library:", error);
    }
  };

  const showHero = currentView !== "home";
  const showLibraryControls = currentView === "library";

  // ────────────────────────────────────────────────────────────────────────
  // Scroll-driven Large Title collapse (iOS-standard behaviour).
  //
  // When the user scrolls the primary view content, the hero band shrinks
  // away and the title slides up into the compact utility row. We listen
  // with capture=true at the document level — this dodges the problem of
  // every view managing its own scroll container; whichever element
  // inside `<main>` actually scrolls, we pick up its `scrollTop`.
  //
  // Threshold: 6px. Small enough to feel responsive ("touched the page
  // and it reacted"), large enough to ignore trackpad flutter.
  // ────────────────────────────────────────────────────────────────────────
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  React.useEffect(() => {
    if (!showHero) {
      setIsCollapsed(false);
      return;
    }
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement | Document | null;
      if (!target || target === document) return;
      const mainEl = document.querySelector("main");
      if (!mainEl || !mainEl.contains(target as Node)) return;
      const top = (target as HTMLElement).scrollTop;
      setIsCollapsed(top > 6);
    };
    document.addEventListener("scroll", handleScroll, true);
    // View switch: reset to expanded. The scroll containers inside the
    // new view typically start at top=0 anyway, but if something inside
    // doesn't fire a scroll event we want the default to be expanded.
    setIsCollapsed(false);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [showHero, currentView]);

  return (
    <header className="flex shrink-0 flex-col border-b border-border-default bg-bg-secondary">
      {/* Compact utility row (always visible). Hosts the small title that
          slides in from below the hero band when the content scrolls. */}
      <div className="flex h-10 items-center gap-2 px-4">
        {/* Compact title that appears in this row only when the hero band
            has collapsed. Uses opacity + translateY for the iOS slide-in
            effect, driven entirely by the `isCollapsed` flag below. */}
        {showHero && (
          <div
            className={cn(
              "min-w-0 flex-1 truncate transition-all duration-200 ease-out",
              isCollapsed
                ? "translate-y-0 opacity-100"
                : "-translate-y-2 opacity-0"
            )}
            aria-hidden={!isCollapsed}
          >
            <span className="text-sm font-semibold text-text-primary">
              {titleFor(currentView)}
            </span>
          </div>
        )}
        {!showHero && <div className="min-w-0 flex-1" />}
        {showLibraryControls && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <Input
                type="text"
                placeholder={t("header.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-64 pl-8 text-xs"
                data-action="header-search"
              />
              <Kbd className="absolute right-2.5 top-1/2 -translate-y-1/2">⌘K</Kbd>
            </div>

            <div className="flex items-center rounded-md border border-border-default">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7 rounded-none rounded-l-md",
                  viewMode === "grid" && "bg-bg-tertiary"
                )}
                onClick={() => setViewMode("grid")}
                aria-label={t("header.viewMode.grid")}
                aria-pressed={viewMode === "grid"}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7 rounded-none rounded-r-md",
                  viewMode === "list" && "bg-bg-tertiary"
                )}
                onClick={() => setViewMode("list")}
                aria-label={t("header.viewMode.list")}
                aria-pressed={viewMode === "list"}
              >
                <List className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleRescan}
              disabled={rescanMutation.isPending || !libraryPath}
              title={t("header.rescanLibrary")}
              aria-label={t("header.rescanLibrary")}
              data-action="rescan-library"
            >
              {rescanMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          </>
        )}
      </div>

      {/* Hero band: Large iOS-style title + subtitle. Hidden on Home where
          the view already renders its own hero. Collapses on scroll —
          we animate max-height / opacity rather than `display: none` so
          the transition stays smooth and reversible. */}
      {showHero && (
        <div
          className={cn(
            "overflow-hidden px-6 transition-all duration-200 ease-out",
            isCollapsed
              ? "max-h-0 -translate-y-2 pb-0 pt-0 opacity-0"
              : "max-h-32 translate-y-0 pb-3 pt-1 opacity-100"
          )}
          aria-hidden={isCollapsed}
        >
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {titleFor(currentView)}
          </h1>
          {subtitleFor(currentView) && (
            <p className="mt-0.5 text-xs text-text-muted">
              {subtitleFor(currentView)}
            </p>
          )}
        </div>
      )}
    </header>
  );
};
