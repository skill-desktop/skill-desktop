import React from "react";
import { useTranslation } from "react-i18next";
import {
  Library,
  FolderTree,
  FlaskConical,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import { useSpaces, useSetSkillVisibility } from "@/hooks";
import { Button } from "@/components/ui";
import { SKILL_DRAG_TYPE } from "@/components/library/SkillCard";

type View = "library" | "spaces" | "sandbox" | "aitools" | "settings";

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const {
    currentView,
    setCurrentView,
    sidebarCollapsed,
    toggleSidebar,
    currentSpaceId,
    setCurrentSpaceId,
  } = useAppStore();

  const { data: spaces = [] } = useSpaces();
  const setSkillVisibilityMutation = useSetSkillVisibility();
  
  // Track which space is being dragged over
  const [dragOverSpaceId, setDragOverSpaceId] = React.useState<string | null>(null);

  const navItems = [
    { id: "library" as View, label: t("nav.library"), icon: <Library className="h-4 w-4" /> },
    { id: "spaces" as View, label: t("nav.spaces"), icon: <FolderTree className="h-4 w-4" /> },
    { id: "sandbox" as View, label: t("nav.sandbox"), icon: <FlaskConical className="h-4 w-4" /> },
    { id: "aitools" as View, label: t("nav.aitools"), icon: <Wrench className="h-4 w-4" /> },
  ];

  // Drag and drop handlers for spaces
  const handleDragOver = (e: React.DragEvent, spaceId: string) => {
    if (e.dataTransfer.types.includes(SKILL_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOverSpaceId(spaceId);
    }
  };

  const handleDragLeave = () => {
    setDragOverSpaceId(null);
  };

  const handleDrop = async (e: React.DragEvent, spaceId: string) => {
    e.preventDefault();
    setDragOverSpaceId(null);
    
    const skillHash = e.dataTransfer.getData(SKILL_DRAG_TYPE);
    if (skillHash) {
      try {
        await setSkillVisibilityMutation.mutateAsync({
          spaceId,
          skillHash,
          isVisible: true,
        });
      } catch (error) {
        console.error("Failed to add skill to space:", error);
      }
    }
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border-default bg-bg-secondary transition-all duration-200",
        sidebarCollapsed ? "w-12" : "w-52"
      )}
    >
      {/* Logo and collapse button */}
      <div className="flex h-10 items-center justify-between border-b border-border-default px-3">
        {!sidebarCollapsed && (
          <span className="text-sm font-semibold text-text-primary">
            {t("app.name")}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => (
          <React.Fragment key={item.id}>
            <button
              onClick={() => setCurrentView(item.id)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors",
                currentView === item.id
                  ? "border-l-2 border-accent-blue bg-bg-tertiary text-text-primary"
                  : "border-l-2 border-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              )}
            >
              {item.icon}
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>

            {/* Show spaces submenu - always visible for drag & drop, expanded when spaces view is selected */}
            {item.id === "spaces" && !sidebarCollapsed && (
              <div className={cn(
                "ml-4 border-l border-border-muted",
                currentView !== "spaces" && "hidden group-hover:block"
              )}>
                {spaces.map((space) => (
                  <button
                    key={space.id}
                    onClick={() => {
                      setCurrentSpaceId(space.id);
                      if (currentView !== "spaces") {
                        setCurrentView("spaces");
                      }
                    }}
                    onDragOver={(e) => handleDragOver(e, space.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, space.id)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors",
                      dragOverSpaceId === space.id
                        ? "bg-accent-blue/20 text-text-primary ring-1 ring-accent-blue"
                        : currentSpaceId === space.id
                        ? "text-text-primary bg-bg-tertiary"
                        : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                    )}
                  >
                    <span className="truncate">{space.name}</span>
                    <div className="flex items-center gap-1">
                      {currentSpaceId === space.id && (
                        <Check className="h-3 w-3 text-accent-blue" />
                      )}
                    </div>
                  </button>
                ))}
                {currentView === "spaces" && (
                  <button
                    onClick={() => {
                      // Trigger the new space dialog in SpacesView
                      const newSpaceButton = document.querySelector('[data-action="new-space"]') as HTMLButtonElement;
                      if (newSpaceButton) {
                        newSpaceButton.click();
                      }
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-muted hover:bg-bg-tertiary hover:text-text-primary"
                  >
                    <Plus className="h-3 w-3" />
                    <span>{t("spaces.newSpace")}</span>
                  </button>
                )}
              </div>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Settings at bottom */}
      <div className="border-t border-border-default py-2">
        <button
          onClick={() => setCurrentView("settings")}
          className={cn(
            "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors",
            currentView === "settings"
              ? "border-l-2 border-accent-blue bg-bg-tertiary text-text-primary"
              : "border-l-2 border-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
          )}
        >
          <Settings className="h-4 w-4" />
          {!sidebarCollapsed && <span>{t("nav.settings")}</span>}
        </button>
      </div>
    </aside>
  );
};
