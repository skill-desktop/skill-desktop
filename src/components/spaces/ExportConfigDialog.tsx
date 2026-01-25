import React from "react";
import { useTranslation } from "react-i18next";
import { Download, Copy } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui";

interface ExportConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportType: "claude" | "generic" | "mcp";
  config: string | null;
  onCopy: () => void;
  onSave: () => void;
}

export const ExportConfigDialog: React.FC<ExportConfigDialogProps> = ({
  open,
  onOpenChange,
  exportType,
  config,
  onCopy,
  onSave,
}) => {
  const { t } = useTranslation();

  const getTitle = () => {
    switch (exportType) {
      case "claude":
        return t("spaces.exportDialog.claudeTitle");
      case "mcp":
        return t("spaces.exportDialog.mcpTitle");
      default:
        return t("spaces.exportDialog.genericTitle");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden mb-4">
          <pre className="text-xs text-text-secondary bg-bg-tertiary rounded-md p-4 overflow-auto max-h-[400px]">
            {config}
          </pre>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onCopy}>
            <Copy className="h-4 w-4 mr-1.5" />
            {t("common.copyToClipboard")}
          </Button>
          <Button onClick={onSave}>
            <Download className="h-4 w-4 mr-1.5" />
            {t("common.saveToFile")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
