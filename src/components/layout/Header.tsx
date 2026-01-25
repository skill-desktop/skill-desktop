import React from "react";
import { useTranslation } from "react-i18next";
import { Search, RefreshCw, LayoutGrid, List, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useSettingsStore } from "@/stores";
import { useRescanLibrary } from "@/hooks";
import { Button, Input } from "@/components/ui";

export const Header: React.FC = () => {
  const { t } = useTranslation();
  const { currentView, searchQuery, setSearchQuery } = useAppStore();
  const { viewMode, setViewMode, libraryPath } = useSettingsStore();
  const rescanMutation = useRescanLibrary();

  const getTitle = () => {
    switch (currentView) {
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

  const handleRescan = async () => {
    if (!libraryPath) return;
    try {
      await rescanMutation.mutateAsync();
    } catch (error) {
      console.error("Failed to rescan library:", error);
    }
  };

  return (
    <header className="flex h-10 items-center justify-between border-b border-border-default bg-bg-secondary px-4">
      {/* Title */}
      <h1 className="text-sm font-semibold text-text-primary">{getTitle()}</h1>

      {/* Search and actions */}
      <div className="flex items-center gap-2">
        {/* Search bar - only show on library view */}
        {currentView === "library" && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              type="text"
              placeholder={t("header.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-64 pl-8 text-xs"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border-default bg-bg-tertiary px-1.5 text-[10px] text-text-muted">
              ⌘K
            </kbd>
          </div>
        )}

        {/* View mode toggle - only show on library view */}
        {currentView === "library" && (
          <div className="flex items-center rounded-md border border-border-default">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 rounded-none rounded-l-md",
                viewMode === "grid" && "bg-bg-tertiary"
              )}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 rounded-none rounded-r-md",
                viewMode === "list" && "bg-bg-tertiary"
              )}
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Refresh button */}
        {currentView === "library" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleRescan}
            disabled={rescanMutation.isPending || !libraryPath}
            title={t("header.rescanLibrary")}
          >
            {rescanMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>
    </header>
  );
};
