import React from "react";
import { useTranslation } from "react-i18next";
import { Download, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, ScrollArea, Badge, Markdown } from "@/components/ui";
import { getPermissionLevel } from "@/types";
import type { PreviewData } from "./types";

interface SkillPreviewPanelProps {
  preview: PreviewData | null;
  onClearPreview: () => void;
  // Import state
  importSuccess: boolean;
  isImporting: boolean;
  importError: unknown;
  onImport: () => void;
}

export const SkillPreviewPanel: React.FC<SkillPreviewPanelProps> = ({
  preview,
  onClearPreview,
  importSuccess,
  isImporting,
  importError,
  onImport,
}) => {
  const { t } = useTranslation();

  if (!preview) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        <div className="text-center">
          <Download className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">{t("hub.preview.enterUrlToPreview")}</p>
          <p className="text-xs mt-1">
            {t("hub.preview.supportedFormats")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Preview header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            {preview.metadata.name}
          </h3>
          <p className="text-sm text-text-muted">
            {preview.metadata.author ? `${t("hub.preview.by")} ${preview.metadata.author}` : t("hub.preview.unknownAuthor")} · v{preview.metadata.version}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClearPreview}
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {/* Description */}
        <div className="mb-4">
          <h4 className="text-xs font-medium text-text-muted mb-2">{t("hub.preview.description")}</h4>
          <Markdown 
            content={preview.metadata.description || t("hub.preview.noDescription")} 
            className="text-sm text-text-secondary"
          />
        </div>

        {/* Tags */}
        {preview.metadata.tags.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-text-muted mb-2">{t("hub.preview.tags")}</h4>
            <div className="flex flex-wrap gap-1">
              {preview.metadata.tags.map((tag) => (
                <Badge key={tag} variant="blue" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Permissions */}
        {preview.metadata.permissions.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-text-muted mb-2">{t("hub.preview.permissionsRequired")}</h4>
            <div className="rounded-md border border-border-default bg-bg-tertiary p-3 space-y-2">
              {preview.metadata.permissions.map((permission) => {
                const level = getPermissionLevel(permission);
                return (
                  <div key={permission} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          level === "low" && "bg-permission-low",
                          level === "medium" && "bg-permission-medium",
                          level === "high" && "bg-permission-high"
                        )}
                      />
                      <span className="text-xs text-text-primary">{permission}</span>
                    </div>
                    <Badge variant={level} className="text-[10px]">
                      {level === "low" ? t("hub.preview.lowRisk") : level === "medium" ? t("hub.preview.mediumRisk") : t("hub.preview.highRisk")}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Parameters */}
        {preview.metadata.parameters.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-text-muted mb-2">{t("hub.preview.parameters")}</h4>
            <div className="space-y-2">
              {preview.metadata.parameters.map((param) => (
                <div key={param.name} className="text-xs">
                  <span className="font-medium text-text-primary">{param.name}</span>
                  <span className="text-text-muted"> ({param.type})</span>
                  {param.required && <span className="text-accent-red"> *</span>}
                  <p className="text-text-secondary mt-0.5">{param.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Source preview */}
        <div className="mb-4">
          <h4 className="text-xs font-medium text-text-muted mb-2">{t("hub.preview.sourcePreview")}</h4>
          <pre className="text-xs text-text-secondary bg-bg-tertiary rounded-md p-3 overflow-x-auto max-h-64">
            {preview.content.slice(0, 1000)}
            {preview.content.length > 1000 && `\n\n${t("hub.preview.truncated")}`}
          </pre>
        </div>
      </ScrollArea>

      {/* Import button */}
      <div className="pt-4 border-t border-border-default">
        {importSuccess ? (
          <Button className="w-full" disabled>
            <Check className="h-4 w-4 mr-2" />
            {t("hub.preview.importedSuccessfully")}
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={onImport}
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {t("hub.preview.importToLibrary")}
          </Button>
        )}
        {importError ? (
          <div className="text-xs text-accent-red mt-2">
            {importError instanceof Error ? importError.message : String(importError)}
          </div>
        ) : null}
      </div>
    </div>
  );
};
