import React from "react";
import { useTranslation } from "react-i18next";
import { Download, AlertTriangle, Loader2 } from "lucide-react";
import { Button, Input } from "@/components/ui";

interface UrlImportPanelProps {
  url: string;
  onUrlChange: (url: string) => void;
  libraryPath: string;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onPreview: () => void;
}

export const UrlImportPanel: React.FC<UrlImportPanelProps> = ({
  url,
  onUrlChange,
  libraryPath,
  isPending,
  isError,
  error,
  onPreview,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-text-muted mb-1.5 block">
          {t("hub.url.label")}
        </label>
        <Input
          placeholder={t("hub.url.placeholder")}
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onPreview()}
        />
      </div>

      {!libraryPath && (
        <div className="flex items-start gap-2 text-xs text-accent-yellow">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{t("hub.warnings.setLibraryPath")}</span>
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-text-muted">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{t("hub.warnings.verifySource")}</span>
      </div>

      <Button
        className="w-full"
        disabled={!url || !libraryPath || isPending}
        onClick={onPreview}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        {t("hub.url.previewContent")}
      </Button>

      {isError && (
        <div className="text-xs text-accent-red">
          {String(error)}
        </div>
      )}
    </div>
  );
};
