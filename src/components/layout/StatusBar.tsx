import React from "react";
import { useTranslation } from "react-i18next";
import { Circle, FolderOpen, Layers, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsStore, useAppStore } from "@/stores";
import { useSkills, useSpaces, useIsFileWatcherRunning, useSkillVisibilityMap } from "@/hooks";

type Status = "ready" | "scanning" | "watching" | "error";

export const StatusBar: React.FC = () => {
  const { t } = useTranslation();
  const { libraryPath } = useSettingsStore();
  const { currentSpaceId } = useAppStore();
  const { data: skills = [], isLoading: isLoadingSkills, error: skillsError } = useSkills();
  const { data: spaces = [] } = useSpaces();
  const { data: isWatching = false } = useIsFileWatcherRunning();
  const { data: visibilityMap = {} } = useSkillVisibilityMap(currentSpaceId);

  // Calculate visible skills count for current space
  const visibleSkillCount = React.useMemo(() => {
    if (Object.keys(visibilityMap).length === 0) return skills.length;
    return Object.values(visibilityMap).filter(Boolean).length;
  }, [visibilityMap, skills.length]);

  // Determine current status
  const status: Status = React.useMemo(() => {
    if (skillsError) return "error";
    if (isLoadingSkills) return "scanning";
    if (isWatching) return "watching";
    return "ready";
  }, [skillsError, isLoadingSkills, isWatching]);

  // Get current space name
  const currentSpace = React.useMemo(() => {
    if (!currentSpaceId) {
      const defaultSpace = spaces.find((s) => s.isDefault);
      return defaultSpace?.name || "Default";
    }
    return spaces.find((s) => s.id === currentSpaceId)?.name || "Unknown";
  }, [currentSpaceId, spaces]);

  // Format library path for display
  const displayPath = React.useMemo(() => {
    if (!libraryPath) return t("common.notSet");
    // Shorten home directory
    const home = "~";
    if (libraryPath.startsWith("/Users/")) {
      const parts = libraryPath.split("/");
      if (parts.length > 2) {
        return home + libraryPath.slice(parts.slice(0, 3).join("/").length);
      }
    }
    // Truncate if too long
    if (libraryPath.length > 30) {
      return "..." + libraryPath.slice(-27);
    }
    return libraryPath;
  }, [libraryPath]);

  const statusConfig = {
    ready: {
      color: "text-text-muted",
      label: t("statusBar.ready"),
    },
    scanning: {
      color: "text-accent-yellow",
      label: t("statusBar.scanning"),
    },
    watching: {
      color: "text-permission-low",
      label: t("statusBar.watching"),
    },
    error: {
      color: "text-accent-red",
      label: t("statusBar.error"),
    },
  };

  const config = statusConfig[status];

  return (
    <footer className="flex h-6 items-center justify-between border-t border-border-default bg-bg-secondary px-3 text-[11px] text-text-muted">
      {/* Left side: Status and Library */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Circle className={cn("h-2 w-2 fill-current", config.color)} />
          <span className={config.color}>{config.label}</span>
        </div>

        <div className="flex items-center gap-1">
          <FolderOpen className="h-3 w-3" />
          <span className="text-text-secondary" title={libraryPath}>
            {displayPath}
          </span>
        </div>
      </div>

      {/* Right side: Stats */}
      <div className="flex items-center gap-4">
        {/* Total skills */}
        <div className="flex items-center gap-1">
          <Layers className="h-3 w-3" />
          <span className="text-text-primary font-medium">{skills.length}</span>
          <span>{t("common.total")}</span>
        </div>

        {/* Visible skills in current space */}
        {currentSpaceId && (
          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            <span className="text-text-primary font-medium">{visibleSkillCount}</span>
            <span>{t("statusBar.visible")}</span>
          </div>
        )}

        {/* Current space */}
        <div className="flex items-center gap-1 border-l border-border-muted pl-4">
          <span className="text-text-secondary">{currentSpace}</span>
        </div>
      </div>
    </footer>
  );
};
