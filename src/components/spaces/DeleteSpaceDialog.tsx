import React from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui";

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
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("spaces.deleteConfirm.title")}
      description={t("spaces.deleteConfirm.description", { name: spaceName })}
      tone="danger"
      confirmLabel={t("common.delete")}
      confirmIcon={<Trash2 className="h-3.5 w-3.5" />}
      cancelLabel={t("common.cancel")}
      isPending={isDeleting}
      onConfirm={onConfirm}
    />
  );
};
