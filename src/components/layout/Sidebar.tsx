import React from "react";
import { useTranslation } from "react-i18next";
import {
  Library,
  FolderTree,
  FlaskConical,
  Settings,
  ChevronLeft,
  ChevronRight,
  Check,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import { useSpaces, useSetSkillVisibility } from "@/hooks";
import { Button, SideNavItem } from "@/components/ui";
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

  const renderNavButton = (
    id: View,
    label: string,
    icon: React.ReactNode
  ) => {
    const active = currentView === id;
    return (
      <button
        type="button"
        onClick={() => setCurrentView(id)}
        title={sidebarCollapsed ? label : undefined}
        className={cn(
          "flex w-full items-center border-l-2 py-2 text-sm transition-colors",
          sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3",
          active
            ? "border-accent-blue bg-bg-tertiary text-text-primary"
            : "border-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
        )}
      >
        <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
        {!sidebarCollapsed && <span className="truncate">{label}</span>}
      </button>
    );
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border-default bg-bg-secondary transition-all duration-200",
        sidebarCollapsed ? "w-12" : "w-52"
      )}
    >
      <div
        className={cn(
          "flex h-10 shrink-0 items-center border-b border-border-default",
          sidebarCollapsed ? "justify-center px-0" : "justify-between px-3"
        )}
      >
        {!sidebarCollapsed && (
          <span className="truncate text-sm font-semibold text-text-primary">
            {t("app.name")}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => (
          <React.Fragment key={item.id}>
            {renderNavButton(item.id, item.label, item.icon)}

            {item.id === "spaces" &&
              !sidebarCollapsed &&
              currentView === "spaces" && (
                <div className="ml-4 mt-0.5 border-l border-border-muted">
                  {spaces.map((space) => (
                    <SideNavItem
                      key={space.id}
                      label={space.name}
                      active={currentSpaceId === space.id}
                      dragOver={dragOverSpaceId === space.id}
                      trailing={
                        currentSpaceId === space.id ? (
                          <Check className="h-3 w-3 text-accent-blue" />
                        ) : null
                      }
                      className="py-1.5 text-xs"
                      onClick={() => {
                        setCurrentSpaceId(space.id);
                        if (currentView !== "spaces") {
                          setCurrentView("spaces");
                        }
                      }}
                      onDragOver={(e) => handleDragOver(e, space.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, space.id)}
                    />
                  ))}
                </div>
              )}
          </React.Fragment>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border-default py-2">
        {renderNavButton(
          "settings",
          t("nav.settings"),
          <Settings className="h-4 w-4" />
        )}
      </div>
    </aside>
  );
};
