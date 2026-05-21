import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderOpen,
  ExternalLink,
  RefreshCw,
  Check,
  Loader2,
  Palette,
  Library,
  Shield,
  Info,
  Bot,
  Terminal,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Input,
  Switch,
  ScrollArea,
  Section,
  SettingRow,
  SidePanel,
  SideNavItem,
} from "@/components/ui";
import { LanguageDropdown } from "@/components/language";
import { useSettingsStore } from "@/stores";
import {
  useSetLibraryPath,
  useLibraryPath,
  useRescanLibrary,
  useUpdateAppSetting,
  useDefaultPaths,
  useEnsureDefaultSkillPath,
} from "@/hooks";
import type { SupportedLanguage } from "@/i18n";
import { LLMSettingsPanel, CLISettingsPanel } from "@/components/settings";

const DOCUMENTATION_URL = "https://github.com/skill-desktop/skill-desktop#readme";
const REPORT_ISSUE_URL = "https://github.com/skill-desktop/skill-desktop/issues/new";
const RELEASES_URL = "https://github.com/skill-desktop/skill-desktop/releases";

async function openUrl(url: string): Promise<void> {
  try {
    await invoke("plugin:opener|open_url", { url });
  } catch (error) {
    console.error("Failed to open URL via Tauri:", error);
    window.open(url, "_blank");
  }
}

async function openFolderDialog(): Promise<string | null> {
  try {
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

type SettingsSection = "appearance" | "library" | "security" | "llm" | "cli" | "about";

interface MenuItem {
  id: SettingsSection;
  icon: React.ReactNode;
  labelKey: string;
}

const menuItems: MenuItem[] = [
  { id: "appearance", icon: <Palette className="h-4 w-4" />, labelKey: "settings.appearance.title" },
  { id: "library", icon: <Library className="h-4 w-4" />, labelKey: "settings.library.title" },
  { id: "security", icon: <Shield className="h-4 w-4" />, labelKey: "settings.security.title" },
  { id: "llm", icon: <Bot className="h-4 w-4" />, labelKey: "settings.llm.title" },
  { id: "cli", icon: <Terminal className="h-4 w-4" />, labelKey: "settings.cli.title" },
  { id: "about", icon: <Info className="h-4 w-4" />, labelKey: "settings.about.title" },
];

export const SettingsView: React.FC = () => {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
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

  const { data: backendLibraryPath } = useLibraryPath();
  const setLibraryPathMutation = useSetLibraryPath();
  const rescanMutation = useRescanLibrary();
  const updateAppSettingMutation = useUpdateAppSetting();
  const { data: defaultPaths } = useDefaultPaths();
  const ensureDefaultPathMutation = useEnsureDefaultSkillPath();

  React.useEffect(() => {
    if (backendLibraryPath && backendLibraryPath !== libraryPath) {
      setLibraryPath(backendLibraryPath);
    }
  }, [backendLibraryPath, libraryPath, setLibraryPath]);

  const handleSelectFolder = async () => {
    try {
      const selected = await openFolderDialog();
      if (selected && typeof selected === "string") {
        setLibraryPath(selected);
        await setLibraryPathMutation.mutateAsync(selected);
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
    }
  };

  const handlePathChange = async (path: string) => {
    setLibraryPath(path);
  };

  const handleUseDefaultPath = async () => {
    try {
      const path = await ensureDefaultPathMutation.mutateAsync();
      setLibraryPath(path);
      await setLibraryPathMutation.mutateAsync(path);
    } catch (error) {
      console.error("Failed to set default path:", error);
    }
  };

  const handlePathBlur = async () => {
    if (libraryPath) {
      try {
        await setLibraryPathMutation.mutateAsync(libraryPath);
      } catch (error) {
        console.error("Failed to set library path:", error);
      }
    }
  };

  const handleRescan = async () => {
    try {
      await rescanMutation.mutateAsync();
    } catch (error) {
      console.error("Failed to rescan library:", error);
    }
  };

  const handleLanguageChange = async (newLanguage: SupportedLanguage) => {
    setLanguage(newLanguage);
    try {
      await updateAppSettingMutation.mutateAsync({
        key: "language",
        value: newLanguage,
      });
    } catch (error) {
      console.error("Failed to save language setting:", error);
    }
  };

  const handleCheckUpdates = async () => {
    await openUrl(RELEASES_URL);
  };

  const renderContent = () => {
    switch (activeSection) {
      case "appearance":
        return (
          <Section title={t("settings.appearance.title")} titleSize="lg">
            <SettingRow
              label={t("settings.appearance.theme")}
              description={t("settings.appearance.themeDesc")}
            >
              <select
                value={theme}
                onChange={(e) =>
                  setTheme(e.target.value as "dark" | "light" | "system")
                }
                className="h-9 rounded-md border border-border-default bg-bg-secondary px-3 text-sm text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
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
        );

      case "library":
        return (
          <Section title={t("settings.library.title")} titleSize="lg">
            <SettingRow
              label={t("settings.library.directory")}
              description={t("settings.library.directoryDesc")}
              stacked
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={libraryPath}
                    onChange={(e) => handlePathChange(e.target.value)}
                    onBlur={handlePathBlur}
                    placeholder={defaultPaths?.skillLibraryPath || "~/SkillLibrary"}
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
                {!libraryPath && defaultPaths && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUseDefaultPath}
                    disabled={ensureDefaultPathMutation.isPending}
                    className="self-start text-xs text-text-muted hover:text-accent-blue"
                  >
                    {ensureDefaultPathMutation.isPending && (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    )}
                    {t("settings.library.useDefault", { path: defaultPaths.skillLibraryPath })}
                  </Button>
                )}
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
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : rescanMutation.isSuccess ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
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
        );

      case "security":
        return (
          <Section title={t("settings.security.title")} titleSize="lg">
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
        );

      case "llm":
        return <LLMSettingsPanel />;

      case "cli":
        return <CLISettingsPanel />;

      case "about":
        return (
          <Section title={t("settings.about.title")} titleSize="lg">
            <div className="space-y-2 text-sm">
              <p className="text-text-primary">
                {t("app.name")}{" "}
                <span className="font-mono text-text-muted">v{__APP_VERSION__}</span>
              </p>
              <p className="text-text-secondary">{t("app.description")}</p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleCheckUpdates}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {t("settings.about.checkUpdates")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => openUrl(DOCUMENTATION_URL)}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {t("settings.about.documentation")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => openUrl(REPORT_ISSUE_URL)}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {t("settings.about.reportIssue")}
              </Button>
            </div>
          </Section>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      <SidePanel title={t("settings.title")}>
        {menuItems.map((item) => (
          <SideNavItem
            key={item.id}
            icon={item.icon}
            label={t(item.labelKey)}
            active={activeSection === item.id}
            onClick={() => setActiveSection(item.id)}
          />
        ))}
      </SidePanel>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl p-6">{renderContent()}</div>
      </ScrollArea>
    </div>
  );
};
