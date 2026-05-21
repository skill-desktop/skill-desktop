import React from "react";
import { useTranslation } from "react-i18next";
import {
  Library,
  Settings,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import { Button } from "@/components/ui";

type View = "home" | "library" | "spaces" | "sandbox" | "aitools" | "settings";

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const {
    currentView,
    setCurrentView,
    sidebarCollapsed,
    toggleSidebar,
  } = useAppStore();

  // Top-level nav after M2-1: Home / Skills (Library) / Integrations (AI Tools).
  // Spaces moves into a switcher above the library list (M2-2). Sandbox folds
  // into the per-skill detail panel (M2-3). Settings stays pinned to the
  // bottom of the sidebar.
  const navItems = [
    { id: "home" as View, label: t("nav.home"), icon: <Home className="h-4 w-4" /> },
    { id: "library" as View, label: t("nav.library"), icon: <Library className="h-4 w-4" /> },
    { id: "aitools" as View, label: t("nav.aitools"), icon: <Wrench className="h-4 w-4" /> },
  ];

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
        {navItems.map((item) =>
          renderNavButton(item.id, item.label, item.icon)
        )}
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
