import React from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, ExternalLink, RefreshCw, Check, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Input, Switch, ScrollArea } from "@/components/ui";
import { LanguageDropdown } from "@/components/language";
import { useSettingsStore } from "@/stores";
import { useSetLibraryPath, useLibraryPath, useRescanLibrary, useUpdateAppSetting } from "@/hooks";
import type { SupportedLanguage } from "@/i18n";

// Constants for external links
const DOCUMENTATION_URL = "https://github.com/anthropics/skill-desktop#readme";
const REPORT_ISSUE_URL = "https://github.com/anthropics/skill-desktop/issues/new";

// Helper to open URL using Tauri opener plugin
async function openUrl(url: string): Promise<void> {
  try {
    await invoke("plugin:opener|open_url", { url });
  } catch (error) {
    // Fallback to window.open if Tauri plugin fails
    console.error("Failed to open URL via Tauri:", error);
    window.open(url, "_blank");
  }
}

// Helper to open folder dialog via Tauri command
async function openFolderDialog(): Promise<string | null> {
  try {
    // Use Tauri's dialog plugin through invoke
    const result = await invoke<string | null>("plugin:dialog|open", {
      options: {
        directory: true,
        multiple: false,
        title: "Select Library Directory",
      },
    });
    return result;
  } catch (error) {
    console.error("Dialog error:", error);
    return null;
  }
}

export const SettingsView: React.FC = () => {
  const { t } = useTranslation();
  const {
    libraryPath,
    setLibraryPath,
    theme,
    setTheme,
    language,
    setLanguage,
    autoSync,
    setAutoSync,
    confirmDangerousCommands,
    setConfirmDangerousCommands,
  } = useSettingsStore();

  // Backend hooks
  const { data: backendLibraryPath } = useLibraryPath();
  const setLibraryPathMutation = useSetLibraryPath();
  const rescanMutation = useRescanLibrary();
  const updateAppSettingMutation = useUpdateAppSetting();

  // Sync local state with backend on mount
  React.useEffect(() => {
    if (backendLibraryPath && backendLibraryPath !== libraryPath) {
      setLibraryPath(backendLibraryPath);
    }
  }, [backendLibraryPath, libraryPath, setLibraryPath]);

  // Handle folder selection
  const handleSelectFolder = async () => {
    try {
      const selected = await openFolderDialog();

      if (selected && typeof selected === "string") {
        // Update local state
        setLibraryPath(selected);
        // Update backend
        await setLibraryPathMutation.mutateAsync(selected);
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
    }
  };

  // Handle manual path input
  const handlePathChange = async (path: string) => {
    setLibraryPath(path);
  };

  // Handle path blur (save to backend)
  const handlePathBlur = async () => {
    if (libraryPath) {
      try {
        await setLibraryPathMutation.mutateAsync(libraryPath);
      } catch (error) {
        console.error("Failed to set library path:", error);
      }
    }
  };

  // Handle rescan
  const handleRescan = async () => {
    try {
      await rescanMutation.mutateAsync();
    } catch (error) {
      console.error("Failed to rescan library:", error);
    }
  };

  // Handle language change
  const handleLanguageChange = async (newLanguage: SupportedLanguage) => {
    setLanguage(newLanguage);
    // Save to backend
    try {
      await updateAppSettingMutation.mutateAsync({
        key: "language",
        value: newLanguage,
      });
    } catch (error) {
      console.error("Failed to save language setting:", error);
    }
  };

  // Handle check for updates
  const handleCheckUpdates = async () => {
    // For now, open the releases page
    await openUrl("https://github.com/anthropics/skill-desktop/releases");
  };

  // Handle open documentation
  const handleOpenDocumentation = async () => {
    await openUrl(DOCUMENTATION_URL);
  };

  // Handle report issue
  const handleReportIssue = async () => {
    await openUrl(REPORT_ISSUE_URL);
  };

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Appearance */}
        <Section title={t("settings.appearance.title")}>
          <SettingRow
            label={t("settings.appearance.theme")}
            description={t("settings.appearance.themeDesc")}
          >
            <select
              value={theme}
              onChange={(e) =>
                setTheme(e.target.value as "dark" | "light" | "system")
              }
              className="h-9 rounded-md border border-border-default bg-bg-secondary px-3 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
            >
              <option value="dark">{t("settings.appearance.dark")}</option>
              <option value="light">{t("settings.appearance.light")}</option>
              <option value="system">{t("settings.appearance.system")}</option>
            </select>
          </SettingRow>

          <SettingRow
            label={t("settings.appearance.language")}
            description={t("settings.appearance.languageDesc")}
          >
            <LanguageDropdown
              value={language}
              onChange={handleLanguageChange}
            />
          </SettingRow>
        </Section>

        {/* Library Settings */}
        <Section title={t("settings.library.title")}>
          <SettingRow
            label={t("settings.library.directory")}
            description={t("settings.library.directoryDesc")}
          >
            <div className="flex items-center gap-2">
              <Input
                value={libraryPath}
                onChange={(e) => handlePathChange(e.target.value)}
                onBlur={handlePathBlur}
                placeholder="~/SkillLibrary"
                className="w-80"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSelectFolder}
                disabled={setLibraryPathMutation.isPending}
              >
                {setLibraryPathMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="h-4 w-4" />
                )}
              </Button>
            </div>
          </SettingRow>

          <SettingRow
            label={t("settings.library.rescan")}
            description={t("settings.library.rescanDesc")}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRescan}
              disabled={rescanMutation.isPending || !libraryPath}
            >
              {rescanMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : rescanMutation.isSuccess ? (
                <Check className="h-3.5 w-3.5 mr-1.5" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {rescanMutation.isPending
                ? t("settings.library.scanning")
                : rescanMutation.isSuccess
                ? t("settings.library.foundSkills", { count: rescanMutation.data })
                : t("settings.library.rescanNow")}
            </Button>
          </SettingRow>

          <SettingRow
            label={t("settings.library.autoSync")}
            description={t("settings.library.autoSyncDesc")}
          >
            <Switch checked={autoSync} onCheckedChange={setAutoSync} />
          </SettingRow>
        </Section>

        {/* Security */}
        <Section title={t("settings.security.title")}>
          <SettingRow
            label={t("settings.security.confirmDangerous")}
            description={t("settings.security.confirmDangerousDesc")}
          >
            <Switch
              checked={confirmDangerousCommands}
              onCheckedChange={setConfirmDangerousCommands}
            />
          </SettingRow>
        </Section>

        {/* About */}
        <Section title={t("settings.about.title")}>
          <div className="space-y-2 text-sm">
            <p className="text-text-primary">
              {t("app.name")} <span className="text-text-muted">v0.1.0</span>
            </p>
            <p className="text-text-secondary">
              {t("app.description")}
            </p>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <Button variant="secondary" size="sm" onClick={handleCheckUpdates}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {t("settings.about.checkUpdates")}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleOpenDocumentation}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              {t("settings.about.documentation")}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleReportIssue}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              {t("settings.about.reportIssue")}
            </Button>
          </div>
        </Section>
      </div>
    </ScrollArea>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div>
    <h2 className="text-sm font-semibold text-text-primary mb-4">{title}</h2>
    <div className="space-y-4">{children}</div>
  </div>
);

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  children,
}) => (
  <div className="flex items-center justify-between py-2">
    <div>
      <p className="text-sm text-text-primary">{label}</p>
      {description && (
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      )}
    </div>
    {children}
  </div>
);
