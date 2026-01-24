import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout";
import { useAppStore } from "@/stores";
import { useFileWatcher } from "@/hooks";
import {
  LibraryView,
  SpacesView,
  HubView,
  SettingsView,
} from "@/views";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function AppContent() {
  const { currentView, setCurrentView, setSearchQuery } = useAppStore();

  // Enable file watcher for auto-refresh
  useFileWatcher();

  // Global keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K - Focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Focus the search input in the header
        const searchInput = document.querySelector('input[placeholder="Search skills..."]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // ⌘, or Ctrl+, - Open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setCurrentView("settings");
      }

      // ⌘R or Ctrl+R - Refresh (only in library view)
      if ((e.metaKey || e.ctrlKey) && e.key === "r" && currentView === "library") {
        e.preventDefault();
        // Trigger refresh button click
        const refreshButton = document.querySelector('button[title="Rescan library"]') as HTMLButtonElement;
        if (refreshButton && !refreshButton.disabled) {
          refreshButton.click();
        }
      }

      // ⌘1-4 - Switch views
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        const views = ["library", "spaces", "hub", "settings"] as const;
        const index = parseInt(e.key) - 1;
        if (index < views.length) {
          setCurrentView(views[index]);
        }
      }

      // Escape - Clear search or close panels
      if (e.key === "Escape") {
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement?.tagName === "INPUT") {
          activeElement.blur();
          setSearchQuery("");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentView, setCurrentView, setSearchQuery]);

  const renderView = () => {
    switch (currentView) {
      case "library":
        return <LibraryView />;
      case "spaces":
        return <SpacesView />;
      case "hub":
        return <HubView />;
      case "settings":
        return <SettingsView />;
      default:
        return <LibraryView />;
    }
  };

  return <MainLayout>{renderView()}</MainLayout>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
