import React from "react";
import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsStore, useAppStore } from "@/stores";
import { useSkills, useSpaces } from "@/hooks";

type Status = "ready" | "scanning" | "error";

export const StatusBar: React.FC = () => {
  const { libraryPath } = useSettingsStore();
  const { currentSpaceId } = useAppStore();
  const { data: skills = [], isLoading: isLoadingSkills, error: skillsError } = useSkills();
  const { data: spaces = [] } = useSpaces();

  // Determine current status
  const status: Status = React.useMemo(() => {
    if (skillsError) return "error";
    if (isLoadingSkills) return "scanning";
    return "ready";
  }, [skillsError, isLoadingSkills]);

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
    if (!libraryPath) return "Not set";
    // Shorten home directory
    const home = "~";
    if (libraryPath.startsWith("/Users/")) {
      const parts = libraryPath.split("/");
      if (parts.length > 2) {
        return home + libraryPath.slice(parts.slice(0, 3).join("/").length);
      }
    }
    // Truncate if too long
    if (libraryPath.length > 40) {
      return "..." + libraryPath.slice(-37);
    }
    return libraryPath;
  }, [libraryPath]);

  const statusConfig = {
    ready: {
      color: "text-permission-low",
      bgColor: "bg-permission-low",
      label: "Ready",
    },
    scanning: {
      color: "text-accent-yellow",
      bgColor: "bg-accent-yellow",
      label: "Scanning",
    },
    error: {
      color: "text-accent-red",
      bgColor: "bg-accent-red",
      label: "Error",
    },
  };

  const config = statusConfig[status];

  return (
    <footer className="flex h-6 items-center justify-between border-t border-border-default bg-bg-secondary px-3 text-[11px] text-text-muted">
      {/* Left side: Status indicator */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Circle className={cn("h-2 w-2 fill-current", config.color)} />
          <span>{config.label}</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-text-muted">Library:</span>
          <span className="text-text-secondary" title={libraryPath}>
            {displayPath}
          </span>
        </div>
      </div>

      {/* Right side: Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <span className="text-text-primary font-medium">{skills.length}</span>
          <span>Skills</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-text-muted">Space:</span>
          <span className="text-text-secondary">{currentSpace}</span>
        </div>
      </div>
    </footer>
  );
};
