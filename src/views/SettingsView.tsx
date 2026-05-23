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
  Download,
  Keyboard,
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
  useCheckAllSkillUpdates,
  useSkills,
} from "@/hooks";
import { useUpdateSkillFromUrl } from "@/hooks/useImport";
import { useAppStore } from "@/stores";
import { toast, Kbd } from "@/components/ui";
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

type SettingsSection =
  | "appearance"
  | "library"
  | "updates"
  | "security"
  | "llm"
  | "cli"
  | "shortcuts"
  | "about";

interface MenuItem {
  id: SettingsSection;
  icon: React.ReactNode;
  labelKey: string;
  /** Visual grouping in the sidebar — purely cosmetic, no logic depends on it. */
  group: "general" | "integrations" | "system";
}

const menuItems: MenuItem[] = [
  { id: "appearance", icon: <Palette className="h-4 w-4" />, labelKey: "settings.appearance.title", group: "general" },
  { id: "library", icon: <Library className="h-4 w-4" />, labelKey: "settings.library.title", group: "general" },
  { id: "updates", icon: <Download className="h-4 w-4" />, labelKey: "settings.updates.title", group: "general" },
  { id: "security", icon: <Shield className="h-4 w-4" />, labelKey: "settings.security.title", group: "general" },
  { id: "llm", icon: <Bot className="h-4 w-4" />, labelKey: "settings.llm.title", group: "integrations" },
  { id: "cli", icon: <Terminal className="h-4 w-4" />, labelKey: "settings.cli.title", group: "integrations" },
  { id: "shortcuts", icon: <Keyboard className="h-4 w-4" />, labelKey: "settings.shortcuts.title", group: "system" },
  { id: "about", icon: <Info className="h-4 w-4" />, labelKey: "settings.about.title", group: "system" },
];

const SETTINGS_GROUPS: Array<{ id: MenuItem["group"]; titleKey: string }> = [
  { id: "general", titleKey: "settings.group.general" },
  { id: "integrations", titleKey: "settings.group.integrations" },
  { id: "system", titleKey: "settings.group.system" },
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
                    placeholder={defaultPaths?.skillLibraryPath || "~/.skill_desktop"}
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

      case "updates":
        return <UpdatesPanel />;

      case "shortcuts":
        return <ShortcutsPanel />;

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
        {SETTINGS_GROUPS.map((group) => {
          const itemsInGroup = menuItems.filter((m) => m.group === group.id);
          if (itemsInGroup.length === 0) return null;
          return (
            <div key={group.id} className="mb-2">
              <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                {t(group.titleKey)}
              </div>
              {itemsInGroup.map((item) => (
                <SideNavItem
                  key={item.id}
                  icon={item.icon}
                  label={t(item.labelKey)}
                  active={activeSection === item.id}
                  onClick={() => setActiveSection(item.id)}
                />
              ))}
            </div>
          );
        })}
      </SidePanel>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl p-6">{renderContent()}</div>
      </ScrollArea>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Updates panel
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Settings → Updates. Lets the user run a one-shot "check all remote skills"
 * pass and apply individual updates inline. Logic mirrors HomeView's
 * suggestion banner but with more detail (full list, last-checked timestamp)
 * because this surface is opt-in.
 */
const UpdatesPanel: React.FC = () => {
  const { t } = useTranslation();
  const { data: skills = [] } = useSkills();
  const checkUpdates = useCheckAllSkillUpdates();
  const updateSkill = useUpdateSkillFromUrl();
  const skillUpdatesCache = useAppStore((s) => s.skillUpdates);
  const lastChecked = useAppStore((s) => s.skillUpdatesCheckedAt);
  const setSkillUpdatesCache = useAppStore((s) => s.setSkillUpdates);
  const markUpdateApplied = useAppStore((s) => s.markUpdateApplied);
  const appliedUpdateHashes = useAppStore((s) => s.appliedUpdateHashes);
  const [updatingHashes, setUpdatingHashes] = React.useState<Set<string>>(
    new Set()
  );

  const skillsWithSource = React.useMemo(
    () => skills.filter((s) => s.sourceUrl && s.isDownloaded),
    [skills]
  );

  const lastResults = skillUpdatesCache ?? [];
  const appliedSet = React.useMemo(
    () => new Set(appliedUpdateHashes),
    [appliedUpdateHashes]
  );
  const liveHashes = React.useMemo(
    () => new Set(skills.map((s) => s.hash)),
    [skills]
  );
  // Same stale-cache guard as HomeView — drop entries whose skill the user
  // already deleted from the library between Check and rendering.
  const liveResults = lastResults.filter((u) => liveHashes.has(u.skillHash));
  const updatable = liveResults.filter(
    (u) => u.hasUpdate && !appliedSet.has(u.skillHash)
  );
  const upToDate = liveResults.filter((u) => !u.hasUpdate);
  const errored = liveResults.filter((u) => u.error);

  const handleCheck = async () => {
    if (skillsWithSource.length === 0) {
      toast.info(t("home.updates.noSourceSkills"));
      return;
    }
    try {
      const results = await checkUpdates.mutateAsync();
      setSkillUpdatesCache(results, new Date().toISOString());
      const updates = results.filter((u) => u.hasUpdate);
      if (updates.length === 0) {
        toast.success(t("home.updates.allUpToDate"));
      } else {
        toast.info(
          t("home.updates.foundToast", { count: updates.length })
        );
      }
    } catch (err) {
      toast.error(
        t("home.updates.checkFailed"),
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const handleApply = async (
    skillHash: string,
    sourceUrl: string,
    skillName: string
  ) => {
    setUpdatingHashes((prev) => new Set(prev).add(skillHash));
    try {
      await updateSkill.mutateAsync({
        currentHash: skillHash,
        sourceUrl,
      });
      markUpdateApplied(skillHash);
      toast.success(t("home.updates.updatedToast", { name: skillName }));
    } catch (err) {
      toast.error(
        t("home.updates.updateFailed", { name: skillName }),
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setUpdatingHashes((prev) => {
        const next = new Set(prev);
        next.delete(skillHash);
        return next;
      });
    }
  };

  return (
    <Section title={t("settings.updates.title")} titleSize="lg">
      <SettingRow
        label={t("settings.updates.checkLabel")}
        description={t("settings.updates.checkDesc", {
          count: skillsWithSource.length,
        })}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCheck}
          disabled={
            checkUpdates.isPending || skillsWithSource.length === 0
          }
        >
          {checkUpdates.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          {t("settings.updates.checkNow")}
        </Button>
      </SettingRow>

      {lastChecked && (
        <p className="px-1 text-xs text-text-muted">
          {t("settings.updates.lastCheckedAt", {
            time: new Date(lastChecked).toLocaleTimeString(),
          })}
        </p>
      )}

      {/* Three empty states (mutually exclusive — they're ordered by
          specificity, only the matching one renders):
          (a) library has no remote-sourced skills at all → "nothing to do"
          (b) we've never been asked to check → "click Check" prompt
          (c) cache survives but every entry refers to a skill that no
              longer exists (e.g. user switched libraries or deleted them
              all) → same "click Check" prompt; it'd be misleading to show
              stale up-to-date pills next to a different library. */}
      {skillsWithSource.length === 0 && (
        <p className="rounded-lg bg-bg-tertiary px-3 py-2 text-xs text-text-secondary">
          {t("settings.updates.noEligible")}
        </p>
      )}
      {skillsWithSource.length > 0 &&
        (skillUpdatesCache === null || liveResults.length === 0) && (
          <p className="rounded-lg bg-bg-tertiary px-3 py-2 text-xs text-text-secondary">
            {t("settings.updates.notYetChecked", {
              count: skillsWithSource.length,
            })}
          </p>
        )}

      {updatable.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-accent-yellow">
            {t("settings.updates.availableHeading", { count: updatable.length })}
          </h3>
          {updatable.map((u) => {
            const isUpdating = updatingHashes.has(u.skillHash);
            return (
              <div
                key={u.skillHash}
                className="flex items-center gap-3 rounded-lg border border-accent-yellow/30 bg-accent-yellow/5 p-3"
              >
                <Download className="h-4 w-4 shrink-0 text-accent-yellow" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {u.skillName}
                  </div>
                  <div className="truncate font-mono text-[10px] text-text-muted">
                    {u.sourceUrl}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void handleApply(u.skillHash, u.sourceUrl, u.skillName)
                  }
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-3 w-3" />
                  )}
                  {t("settings.updates.applyOne")}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {upToDate.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("settings.updates.upToDateHeading", { count: upToDate.length })}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {upToDate.map((u) => (
              <span
                key={u.skillHash}
                className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] text-text-secondary"
              >
                {u.skillName}
              </span>
            ))}
          </div>
        </div>
      )}

      {errored.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-accent-red">
            {t("settings.updates.errorsHeading", { count: errored.length })}
          </h3>
          {errored.map((u) => (
            <div
              key={u.skillHash}
              className="rounded-lg border border-accent-red/20 bg-accent-red/5 p-2 text-xs"
            >
              <div className="font-medium text-text-primary">{u.skillName}</div>
              <div className="mt-0.5 text-text-muted">{u.error}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Shortcuts reference panel
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Settings → Shortcuts. Same content as the `?`-triggered overlay, but
 * accessible from a settings menu for discovery. We could DRY this against
 * `<ShortcutsHelp />` later — for now we keep them parallel because the
 * settings panel doesn't need a Dialog wrapper.
 */
const ShortcutsPanel: React.FC = () => {
  const { t } = useTranslation();
  const setShortcutsHelpOpen = useAppStore((s) => s.setShortcutsHelpOpen);

  return (
    <Section title={t("settings.shortcuts.title")} titleSize="lg">
      <p className="text-sm text-text-secondary">
        {t("settings.shortcuts.description")}
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-secondary px-3 py-2">
        <Keyboard className="h-4 w-4 text-text-muted" />
        <span className="flex-1 text-sm text-text-secondary">
          {t("settings.shortcuts.openOverlay")}
        </span>
        <Kbd>?</Kbd>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setShortcutsHelpOpen(true)}
      >
        <Keyboard className="mr-1.5 h-3.5 w-3.5" />
        {t("settings.shortcuts.showAll")}
      </Button>
    </Section>
  );
};
