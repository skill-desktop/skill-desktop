import React from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Loader2,
  Folder,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
} from "@/components/ui";
import {
  useInstallTargets,
  useInstallSkillToTool,
  useUninstallSkillFromTool,
  useSkillInstallations,
  type InstallTargetInfo,
  type InstallTargetKind,
} from "@/hooks";
import { useShowInFolder } from "@/hooks";
import { useSettingsStore } from "@/stores";
import type { Skill } from "@/types";

interface InstallSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: Skill | null;
}

async function pickCustomDirectory(): Promise<string | null> {
  try {
    const result = await invoke<string | null>("plugin:dialog|open", {
      options: {
        directory: true,
        multiple: false,
        title: "Choose install directory",
      },
    });
    return result ?? null;
  } catch {
    return null;
  }
}

export const InstallSkillDialog: React.FC<InstallSkillDialogProps> = ({
  open,
  onOpenChange,
  skill,
}) => {
  const { t } = useTranslation();
  const { data: targets = [] } = useInstallTargets();
  const { data: installations = [], refetch } = useSkillInstallations(
    skill?.skillId ?? null
  );
  const installMutation = useInstallSkillToTool();
  const uninstallMutation = useUninstallSkillFromTool();
  const showInFolder = useShowInFolder();
  const { libraryPath } = useSettingsStore();

  const [customPath, setCustomPath] = React.useState("");
  const [pendingKind, setPendingKind] = React.useState<InstallTargetKind | null>(
    null
  );

  if (!skill) return null;

  const installedByTarget = new Map(
    installations.map((i) => [i.targetPath, i])
  );

  const handleInstall = async (target: InstallTargetInfo) => {
    setPendingKind(target.kind);
    try {
      const path =
        target.kind === "custom" ? customPath.trim() || undefined : undefined;
      if (target.kind === "custom" && !path) return;
      await installMutation.mutateAsync({
        skillId: skill.skillId,
        targetKind: target.kind,
        customPath: path,
      });
      await refetch();
    } catch (e) {
      console.error("Install failed:", e);
    } finally {
      setPendingKind(null);
    }
  };

  const handleUninstall = async (
    installation: { linkedPath: string; targetPath: string }
  ) => {
    try {
      await uninstallMutation.mutateAsync({
        skillId: skill.skillId,
        linkedPath: installation.linkedPath,
        targetPath: installation.targetPath,
      });
      await refetch();
    } catch (e) {
      console.error("Uninstall failed:", e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("installSkill.title", "Install to AI tool")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "installSkill.description",
              "Creates a symbolic link from this skill into the target tool's skills directory. The tool will discover the skill on next launch."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {targets.map((target) => {
            const installed =
              target.defaultPath && installedByTarget.get(target.defaultPath);
            const isCustom = target.kind === "custom";
            // The default library path is itself a well-known skill directory.
            // Installing the skill there is a no-op (it's already discovered), so
            // we surface that state instead of letting the user trigger an error.
            const isLibraryItself =
              !!target.defaultPath &&
              !!libraryPath &&
              target.defaultPath === libraryPath;

            return (
              <div
                key={target.kind}
                className="flex items-start gap-3 rounded-lg border border-border-default bg-bg-secondary p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary">
                    {target.label}
                  </div>
                  {target.defaultPath && (
                    <div className="text-xs text-text-muted font-mono truncate mt-0.5">
                      {target.defaultPath}
                    </div>
                  )}
                  {isCustom && (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        value={customPath}
                        onChange={(e) => setCustomPath(e.target.value)}
                        placeholder="/absolute/path/to/skills/dir"
                        className="text-xs flex-1"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const picked = await pickCustomDirectory();
                          if (picked) setCustomPath(picked);
                        }}
                      >
                        <Folder className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {installed && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-accent-green">
                      <CheckCircle2 className="h-3 w-3" />
                      <span className="font-mono truncate">
                        {installed.linkedPath}
                      </span>
                    </div>
                  )}
                  {isLibraryItself && !installed && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-accent-green">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>
                        {t(
                          "installSkill.alreadyInLibrary",
                          "Already in your skill library"
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isLibraryItself && !installed ? null : installed ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          showInFolder.mutate(installed.linkedPath)
                        }
                        title={t("common.revealInFinder", "Reveal")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-accent-red"
                        onClick={() => handleUninstall(installed)}
                        disabled={uninstallMutation.isPending}
                        title={t("installSkill.uninstall", "Uninstall")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleInstall(target)}
                      disabled={
                        installMutation.isPending ||
                        (isCustom && !customPath.trim())
                      }
                    >
                      {pendingKind === target.kind &&
                      installMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        t("installSkill.install", "Install")
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.close", "Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
