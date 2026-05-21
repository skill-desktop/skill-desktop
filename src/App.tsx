import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Import i18n configuration first to ensure it's initialized before useTranslation
import "@/i18n";
import { useTranslation } from "react-i18next";
import { MainLayout } from "@/components/layout";
import { LanguageSelector } from "@/components/language";
import { useAppStore, useSettingsStore } from "@/stores";
import { useFileWatcher, useLoadAppSettings, useSaveAppSettings, useLibraryPath } from "@/hooks";
import {
  LibraryView,
  SpacesView,
  SandboxView,
  SettingsView,
  AIToolsView,
} from "@/views";
import { changeLanguage, detectBrowserLanguage, type SupportedLanguage } from "@/i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function AppContent() {
  const { t } = useTranslation();
  const { currentView, setCurrentView, setSearchQuery } = useAppStore();
  const { setLanguage, setSetupCompleted, setLibraryPath, libraryPath } = useSettingsStore();

  // Load app settings from Tauri backend
  const { data: appSettings, isLoading: isLoadingSettings } = useLoadAppSettings();
  const saveAppSettingsMutation = useSaveAppSettings();

  // Load library path from backend (includes default path fallback)
  const { data: backendLibraryPath } = useLibraryPath();

  // State for language selector dialog
  const [showLanguageSelector, setShowLanguageSelector] = React.useState(false);
  const [isInitialized, setIsInitialized] = React.useState(false);

  // Enable file watcher for auto-refresh
  useFileWatcher();

  // Sync library path from backend to frontend store
  React.useEffect(() => {
    if (backendLibraryPath && backendLibraryPath !== libraryPath) {
      setLibraryPath(backendLibraryPath);
    }
  }, [backendLibraryPath, libraryPath, setLibraryPath]);

  // Initialize language and check if first launch
  React.useEffect(() => {
    if (isLoadingSettings || isInitialized) return;

    const initializeApp = async () => {
      if (appSettings) {
        // App settings loaded from backend
        if (appSettings.setupCompleted) {
          // User has completed setup, use saved language
          if (appSettings.language) {
            await changeLanguage(appSettings.language as SupportedLanguage);
            setLanguage(appSettings.language as SupportedLanguage);
          }
          setSetupCompleted(true);
        } else {
          // First launch - detect browser language and show selector
          const detectedLang = detectBrowserLanguage();
          await changeLanguage(detectedLang);
          setLanguage(detectedLang);
          setShowLanguageSelector(true);
        }
      } else {
        // No settings file exists - first launch
        const detectedLang = detectBrowserLanguage();
        await changeLanguage(detectedLang);
        setLanguage(detectedLang);
        setShowLanguageSelector(true);
      }
      setIsInitialized(true);
    };

    initializeApp();
  }, [appSettings, isLoadingSettings, isInitialized, setLanguage, setSetupCompleted]);

  // Handle language selection completion
  const handleLanguageSelected = async (selectedLanguage: SupportedLanguage) => {
    setLanguage(selectedLanguage);
    setSetupCompleted(true);
    
    // Save to backend
    await saveAppSettingsMutation.mutateAsync({
      language: selectedLanguage,
      setupCompleted: true,
      theme: undefined,
    });
  };

  // Global keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K - Focus the global search input. We target the input by
      // data-attribute (rather than by type or i18n'd label) so it keeps
      // working in every locale and even when other text inputs are mounted.
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        const searchInput = document.querySelector(
          '[data-action="header-search"]'
        ) as HTMLInputElement | null;
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      }

      // ⌘, or Ctrl+, - Open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setCurrentView("settings");
      }

      // ⌘R or Ctrl+R - Refresh (only in library view). Match by data-attribute
      // so non-English locales still trigger the rescan instead of falling back
      // to the browser's default reload behaviour.
      if ((e.metaKey || e.ctrlKey) && e.key === "r" && currentView === "library") {
        const refreshButton = document.querySelector(
          'button[data-action="rescan-library"]'
        ) as HTMLButtonElement | null;
        if (refreshButton && !refreshButton.disabled) {
          e.preventDefault();
          refreshButton.click();
        }
      }

      // ⌘1-5 - Switch views
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const views = ["library", "spaces", "sandbox", "aitools", "settings"] as const;
        const index = parseInt(e.key) - 1;
        if (index < views.length) {
          setCurrentView(views[index]);
        }
      }

      // ⌘N or Ctrl+N - New space (when in spaces view)
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        if (currentView === "spaces") {
          // Trigger the new space button
          const newSpaceButton = document.querySelector('[data-action="new-space"]') as HTMLButtonElement;
          if (newSpaceButton) {
            newSpaceButton.click();
          }
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
      case "sandbox":
        return <SandboxView />;
      case "aitools":
        return <AIToolsView />;
      case "settings":
        return <SettingsView />;
      default:
        return <LibraryView />;
    }
  };

  // Show loading state while initializing
  if (!isInitialized && isLoadingSettings) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary">
        <div className="text-text-muted">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <>
      <MainLayout>{renderView()}</MainLayout>
      
      {/* First launch language selector */}
      <LanguageSelector
        open={showLanguageSelector}
        onOpenChange={setShowLanguageSelector}
        onLanguageSelected={handleLanguageSelected}
        showContinueButton={true}
        required={true}
      />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
