import React from "react";
import { useTranslation } from "react-i18next";
import { Github, Download, AlertTriangle, Loader2, Folder, FileText, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, ScrollArea } from "@/components/ui";
import type { GitHubFileEntry } from "./types";

interface GitHubImportPanelProps {
  githubUrl: string;
  onGithubUrlChange: (url: string) => void;
  libraryPath: string;
  onConnect: () => void;
  // Browser state
  browsingEnabled: boolean;
  githubOwner: string;
  githubRepo: string;
  githubPath: string;
  pathHistory: string[];
  onNavigateBack: () => void;
  onNavigateToPath: (path: string) => void;
  // Files
  githubFiles: GitHubFileEntry[];
  isLoadingGithub: boolean;
  githubError: unknown;
  selectedFiles: Set<string>;
  onToggleFileSelection: (path: string) => void;
  onPreviewFile: (file: GitHubFileEntry) => void;
  // Import
  onImportSelected: () => void;
  onImportDirectory: () => void;
  isImportingFiles: boolean;
  isImportingDirectory: boolean;
  importDirectoryResult?: { imported: number; skipped: number } | null;
}

export const GitHubImportPanel: React.FC<GitHubImportPanelProps> = ({
  githubUrl,
  onGithubUrlChange,
  libraryPath,
  onConnect,
  browsingEnabled,
  githubOwner,
  githubRepo,
  githubPath,
  pathHistory,
  onNavigateBack,
  onNavigateToPath,
  githubFiles,
  isLoadingGithub,
  githubError,
  selectedFiles,
  onToggleFileSelection,
  onPreviewFile,
  onImportSelected,
  onImportDirectory,
  isImportingFiles,
  isImportingDirectory,
  importDirectoryResult,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-text-muted mb-1.5 block">
          {t("hub.github.repoUrl")}
        </label>
        <Input
          placeholder={t("hub.github.repoUrlPlaceholder")}
          value={githubUrl}
          onChange={(e) => onGithubUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onConnect()}
        />
      </div>

      {!libraryPath && (
        <div className="flex items-start gap-2 text-xs text-accent-yellow">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{t("hub.warnings.setLibraryPath")}</span>
        </div>
      )}

      <Button
        className="w-full"
        disabled={!githubUrl || !libraryPath}
        onClick={onConnect}
      >
        <Github className="h-4 w-4 mr-2" />
        {t("hub.github.connectToRepo")}
      </Button>

      {/* File browser */}
      {browsingEnabled && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {pathHistory.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onNavigateBack}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
              )}
              <span className="text-xs text-text-muted">
                {githubOwner}/{githubRepo}/{githubPath || ""}
              </span>
            </div>
          </div>

          {isLoadingGithub ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            </div>
          ) : githubError ? (
            <div className="text-xs text-accent-red py-4">
              {String(githubError)}
            </div>
          ) : (
            <ScrollArea className="h-48 rounded-md border border-border-default">
              <div className="divide-y divide-border-muted">
                {githubFiles.map((file) => (
                  <div
                    key={file.path}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-tertiary cursor-pointer",
                      selectedFiles.has(file.path) && "bg-accent-blue/10"
                    )}
                  >
                    {file.fileType === "dir" ? (
                      <button
                        className="flex items-center gap-2 flex-1"
                        onClick={() => onNavigateToPath(file.path)}
                      >
                        <Folder className="h-3.5 w-3.5 text-accent-yellow" />
                        <span className="text-text-primary">{file.name}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-text-muted ml-auto" />
                      </button>
                    ) : (
                      <>
                        {file.name.endsWith(".md") && (
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(file.path)}
                            onChange={() => onToggleFileSelection(file.path)}
                            className="h-3.5 w-3.5"
                          />
                        )}
                        <button
                          className="flex items-center gap-2 flex-1"
                          onClick={() => onPreviewFile(file)}
                          disabled={!file.name.endsWith(".md")}
                        >
                          <FileText className={cn(
                            "h-3.5 w-3.5",
                            file.name.endsWith(".md") ? "text-accent-blue" : "text-text-muted"
                          )} />
                          <span className={cn(
                            file.name.endsWith(".md") ? "text-text-primary" : "text-text-muted"
                          )}>
                            {file.name}
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Import actions */}
          <div className="flex items-center gap-2 mt-3">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={onImportSelected}
              disabled={selectedFiles.size === 0 || isImportingFiles}
            >
              {isImportingFiles ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t("hub.github.importSelected")} ({selectedFiles.size})
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onImportDirectory}
              disabled={isImportingDirectory}
            >
              {isImportingDirectory ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Folder className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t("hub.github.importAll")}
            </Button>
          </div>

          {importDirectoryResult && (
            <div className="text-xs text-accent-green mt-2">
              {t("hub.github.importedSkills", { count: importDirectoryResult.imported })}
              {importDirectoryResult.skipped > 0 && `, ${t("hub.github.skippedSkills", { count: importDirectoryResult.skipped })}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
