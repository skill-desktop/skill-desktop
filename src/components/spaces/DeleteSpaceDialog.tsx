import React from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Loader2 } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui";

interface DeleteSpaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceName: string;
  onConfirm: () => void;
  isDeleting: boolean;
}

export const DeleteSpaceDialog: React.FC<DeleteSpaceDialogProps> = ({
  open,
  onOpenChange,
  spaceName,
  onConfirm,
  isDeleting,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("spaces.deleteConfirm.title")}</DialogTitle>
          <DialogDescription>
            {t("spaces.deleteConfirm.description", { name: spaceName })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
