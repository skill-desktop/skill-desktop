import React from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Plus, Check, Loader2, CopyPlus } from "lucide-react";
import { Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui";

interface SpaceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit" | "clone";
  // Form values
  name: string;
  activeDir: string;
  description: string;
  onNameChange: (name: string) => void;
  onActiveDirChange: (dir: string) => void;
  onDescriptionChange: (desc: string) => void;
  onSelectFolder: () => void;
  // Submit
  onSubmit: () => void;
  isSubmitting: boolean;
  // Clone specific
  cloneSourceName?: string;
}

export const SpaceFormDialog: React.FC<SpaceFormDialogProps> = ({
  open,
  onOpenChange,
  mode,
  name,
  activeDir,
  description,
  onNameChange,
  onActiveDirChange,
  onDescriptionChange,
  onSelectFolder,
  onSubmit,
  isSubmitting,
  cloneSourceName,
}) => {
  const { t } = useTranslation();

  const getTitle = () => {
    switch (mode) {
      case "create":
        return t("spaces.createSpace");
      case "edit":
        return t("spaces.editSpace");
      case "clone":
        return t("spaces.cloneDialog.title");
    }
  };

  const getSubmitIcon = () => {
    if (isSubmitting) return <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />;
    switch (mode) {
      case "create":
        return <Plus className="h-4 w-4 mr-1.5" />;
      case "edit":
        return <Check className="h-4 w-4 mr-1.5" />;
      case "clone":
        return <CopyPlus className="h-4 w-4 mr-1.5" />;
    }
  };

  const getSubmitText = () => {
    switch (mode) {
      case "create":
        return t("common.create");
      case "edit":
        return t("common.saveChanges");
      case "clone":
        return t("spaces.cloneSpace");
    }
  };

  const isActiveDirRequired = mode === "create" || mode === "clone";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          {mode === "clone" && cloneSourceName && (
            <DialogDescription>
              {t("spaces.cloneDialog.description", { name: cloneSourceName })}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-xs text-text-muted mb-1.5 block">
              {mode === "clone" ? `${t("spaces.cloneDialog.newSpaceName")} *` : t("spaces.form.spaceNameRequired")}
            </label>
            <Input
              placeholder={mode === "clone" ? t("spaces.cloneDialog.newSpaceNamePlaceholder") : t("spaces.form.spaceNamePlaceholder")}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-text-muted mb-1.5 block">
              {isActiveDirRequired ? t("spaces.form.activeDirectoryRequired") : t("spaces.form.activeDirectory")}
            </label>
            <div className="flex items-center gap-2">
              <Input
                placeholder={t("spaces.form.activeDirectoryPlaceholder")}
                value={activeDir}
                onChange={(e) => onActiveDirChange(e.target.value)}
                className="flex-1"
              />
              <Button variant="secondary" size="sm" onClick={onSelectFolder}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {mode !== "clone" && (
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">
                {mode === "create" ? t("spaces.form.descriptionOptional") : t("spaces.form.description")}
              </label>
              <Input
                placeholder={t("spaces.form.descriptionPlaceholder")}
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!name || (isActiveDirRequired && !activeDir) || isSubmitting}
          >
            {getSubmitIcon()}
            {getSubmitText()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
