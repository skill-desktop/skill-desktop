import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Import i18n configuration first to ensure it's initialized before useTranslation
import "@/i18n";
import { useTranslation } from "react-i18next";
import { MainLayout } from "@/components/layout";
import { LanguageSelector } from "@/components/language";
import { QuickInstallSheet } from "@/components/QuickInstallSheet";
import { OnboardingWizard } from "@/components/onboarding";
import { CommandPalette } from "@/components/CommandPalette";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { Toaster } from "@/components/ui";
import { useAppStore, useSettingsStore } from "@/stores";
import { useFileWatcher, useLoadAppSettings, useSaveAppSettings, useLibraryPath } from "@/hooks";
import {
  HomeView,
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
  const {
    currentView,
    setCurrentView,
    setSearchQuery,
    setCommandPaletteOpen,
    setShortcutsHelpOpen,
  } = useAppStore();
  const { setLanguage, setSetupCompleted, setLibraryPath, libraryPath } = useSettingsStore();

  // Load app settings from Tauri backend
  const { data: appSettings, isLoading: isLoadingSettings } = useLoadAppSettings();
  const saveAppSettingsMutation = useSaveAppSettings();

  // Load library path from backend (includes default path fallback)
  const { data: backendLibraryPath } = useLibraryPath();

  // First-launch flow state.
  // - showLanguageSelector: pick a language (always first)
  // - showOnboarding: 3-step setup that runs *after* language is picked
  // Both are gated by `setupCompleted` in app settings, which gets flipped to
  // true by OnboardingWizard.handleFinish.
  const [showLanguageSelector, setShowLanguageSelector] = React.useState(false);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
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
      // Three resolutions:
      //   1. setupCompleted=true                  → returning user, just load lang
      //   2. setupCompleted=false + has language  → resume onboarding (lang done)
      //   3. no settings at all                   → fresh install, full flow
      if (appSettings) {
        if (appSettings.setupCompleted) {
          if (appSettings.language) {
            await changeLanguage(appSettings.language as SupportedLanguage);
            setLanguage(appSettings.language as SupportedLanguage);
          }
          setSetupCompleted(true);
        } else if (appSettings.language) {
          // Language already chosen in a previous (interrupted) session; just
          // resume onboarding without re-asking the language.
          await changeLanguage(appSettings.language as SupportedLanguage);
          setLanguage(appSettings.language as SupportedLanguage);
          setShowOnboarding(true);
        } else {
          const detectedLang = detectBrowserLanguage();
          await changeLanguage(detectedLang);
          setLanguage(detectedLang);
          setShowLanguageSelector(true);
        }
      } else {
        const detectedLang = detectBrowserLanguage();
        await changeLanguage(detectedLang);
        setLanguage(detectedLang);
        setShowLanguageSelector(true);
      }
      setIsInitialized(true);
    };

    initializeApp();
  }, [appSettings, isLoadingSettings, isInitialized, setLanguage, setSetupCompleted]);

  // Handle language selection completion. We deliberately *don't* mark
  // setupCompleted=true here — that flag stays false until the user finishes
  // the onboarding wizard. Saving language but not setup means the next
  // launch (e.g. if they crash mid-onboarding) will reload the saved language
  // and re-show the onboarding wizard, not the language selector.
  const handleLanguageSelected = async (selectedLanguage: SupportedLanguage) => {
    setLanguage(selectedLanguage);
    try {
      await saveAppSettingsMutation.mutateAsync({
        language: selectedLanguage,
        setupCompleted: false,
        theme: undefined,
      });
    } catch (e) {
      console.error("Failed to save language:", e);
    }
    // Chain straight into onboarding.
    setShowOnboarding(true);
  };

  // OnboardingWizard already flips `setupCompleted` server-side via
  // useUpdateAppSetting before calling onComplete. We just close the dialog
  // and update the local zustand store here.
  const handleOnboardingComplete = () => {
    setSetupCompleted(true);
    setShowOnboarding(false);
  };

  // Global keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K — open the global command palette. Replaces the older
      // "focus header search" behaviour: the search box is now reachable from
      // the palette ("Search skills...") and also stays clickable inline.
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
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

      // ⌘1-6 - Switch views (Home is the new #1; everything else shifts by +1)
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "6") {
        e.preventDefault();
        const views = [
          "home",
          "library",
          "spaces",
          "sandbox",
          "aitools",
          "settings",
        ] as const;
        const index = parseInt(e.key) - 1;
        if (index < views.length) {
          setCurrentView(views[index]);
        }
      }

      // ? — global "show keyboard shortcuts" overlay (iOS / macOS muscle
      // memory). We only trigger when the user is NOT in a text input,
      // since "?" is a legitimate character in URLs / search strings.
      // `isContentEditable` is the DOM property which is true for both
      // `contenteditable=""` and `contenteditable="plaintext-only"`, which
      // a plain string compare on getAttribute would miss.
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement as HTMLElement | null;
        const tag = active?.tagName?.toLowerCase();
        const isTyping =
          tag === "input" ||
          tag === "textarea" ||
          (!!active && active.isContentEditable);
        if (!isTyping) {
          e.preventDefault();
          setShortcutsHelpOpen(true);
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
  }, [
    currentView,
    setCurrentView,
    setSearchQuery,
    setCommandPaletteOpen,
    setShortcutsHelpOpen,
  ]);

  const renderView = () => {
    switch (currentView) {
      case "home":
        return <HomeView />;
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
        return <HomeView />;
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

      {/* Global "drop any skill file anywhere → install" surface. Listens to
          tauri://drag-drop at the App level and bails when the Import dialog
          is open (its LocalImportPanel handles drops there). */}
      <QuickInstallSheet />

      {/* ⌘K command palette — opens from anywhere. */}
      <CommandPalette />

      {/* ? shortcut help — opens from anywhere. */}
      <ShortcutsHelp />

      {/* Global toast stack — driven imperatively via `toast.success(...)`. */}
      <Toaster />

      {/* First launch language selector */}
      <LanguageSelector
        open={showLanguageSelector}
        onOpenChange={setShowLanguageSelector}
        onLanguageSelected={handleLanguageSelected}
        showContinueButton={true}
        required={true}
      />

      {/* First launch onboarding (3 steps), shown after language is picked */}
      <OnboardingWizard
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
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
