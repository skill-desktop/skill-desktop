import React from "react";
import { FolderOpen, ExternalLink, RefreshCw, Check, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Input, Switch, ScrollArea } from "@/components/ui";
import { useSettingsStore } from "@/stores";
import { useSetLibraryPath, useLibraryPath, useRescanLibrary } from "@/hooks";

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
  const {
    libraryPath,
    setLibraryPath,
    theme,
    setTheme,
    autoSync,
    setAutoSync,
    confirmDangerousCommands,
    setConfirmDangerousCommands,
  } = useSettingsStore();

  // Backend hooks
  const { data: backendLibraryPath } = useLibraryPath();
  const setLibraryPathMutation = useSetLibraryPath();
  const rescanMutation = useRescanLibrary();

  // Sync local state with backend on mount
  React.useEffect(() => {
    if (backendLibraryPath && backendLibraryPath !== libraryPath) {
      setLibraryPath(backendLibraryPath);
    }
  }, [backendLibraryPath]);

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

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Appearance */}
        <Section title="Appearance">
          <SettingRow
            label="Theme"
            description="Choose your preferred color scheme"
          >
            <select
              value={theme}
              onChange={(e) =>
                setTheme(e.target.value as "dark" | "light" | "system")
              }
              className="h-9 rounded-md border border-border-default bg-bg-secondary px-3 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </SettingRow>
        </Section>

        {/* Library Settings */}
        <Section title="Library Settings">
          <SettingRow
            label="Library Directory"
            description="Location where your skills are stored"
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
            label="Rescan Library"
            description="Manually rescan the library directory for changes"
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
                ? "Scanning..."
                : rescanMutation.isSuccess
                ? `Found ${rescanMutation.data} skills`
                : "Rescan Now"}
            </Button>
          </SettingRow>

          <SettingRow
            label="Auto-sync file changes"
            description="Automatically update index when files change"
          >
            <Switch checked={autoSync} onCheckedChange={setAutoSync} />
          </SettingRow>
        </Section>

        {/* Security */}
        <Section title="Security">
          <SettingRow
            label="Confirm dangerous commands"
            description="Show confirmation before executing shell commands"
          >
            <Switch
              checked={confirmDangerousCommands}
              onCheckedChange={setConfirmDangerousCommands}
            />
          </SettingRow>
        </Section>

        {/* About */}
        <Section title="About">
          <div className="space-y-2 text-sm">
            <p className="text-text-primary">
              Skill Desktop <span className="text-text-muted">v0.1.0</span>
            </p>
            <p className="text-text-secondary">
              Agent Skill management infrastructure for developers
            </p>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <Button variant="secondary" size="sm">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Check for Updates
            </Button>
            <Button variant="secondary" size="sm">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Documentation
            </Button>
            <Button variant="secondary" size="sm">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Report Issue
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
