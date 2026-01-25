import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCreateSkill, useOpenSkillDirectory } from "@/hooks";
import { validateSkillName, validateSkillDescription } from "@/types/skill";

interface CreateSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "name" | "description" | "options" | "success";

export function CreateSkillDialog({ open, onOpenChange }: CreateSkillDialogProps) {
  const { t } = useTranslation();
  const createSkill = useCreateSkill();
  const openSkillDirectory = useOpenSkillDirectory();

  // Form state
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [license, setLicense] = useState("");
  const [includeScripts, setIncludeScripts] = useState(true);
  const [includeReferences, setIncludeReferences] = useState(true);
  const [includeAssets, setIncludeAssets] = useState(false);

  // Validation state
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  // Result state
  const [createdSkillDir, setCreatedSkillDir] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setStep("name");
    setName("");
    setDescription("");
    setLicense("");
    setIncludeScripts(true);
    setIncludeReferences(true);
    setIncludeAssets(false);
    setNameError(null);
    setDescriptionError(null);
    setCreatedSkillDir(null);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Reset form after dialog closes
    setTimeout(resetForm, 300);
  }, [onOpenChange, resetForm]);

  const validateName = useCallback((value: string): boolean => {
    if (!value) {
      setNameError(t("createSkill.nameRequired"));
      return false;
    }
    if (!validateSkillName(value)) {
      if (value.length > 64) {
        setNameError(t("createSkill.nameTooLong"));
      } else if (!/^[a-z0-9-]+$/.test(value)) {
        setNameError(t("createSkill.nameInvalidChars"));
      } else if (value.startsWith("-") || value.endsWith("-") || value.includes("--")) {
        setNameError(t("createSkill.nameInvalidHyphens"));
      } else {
        setNameError(t("createSkill.nameInvalid"));
      }
      return false;
    }
    setNameError(null);
    return true;
  }, [t]);

  const validateDesc = useCallback((value: string): boolean => {
    if (!value) {
      setDescriptionError(t("createSkill.descriptionRequired"));
      return false;
    }
    if (!validateSkillDescription(value)) {
      if (value.length > 1024) {
        setDescriptionError(t("createSkill.descriptionTooLong"));
      } else if (value.includes("<") || value.includes(">")) {
        setDescriptionError(t("createSkill.descriptionInvalidChars"));
      } else {
        setDescriptionError(t("createSkill.descriptionInvalid"));
      }
      return false;
    }
    setDescriptionError(null);
    return true;
  }, [t]);

  const handleNameNext = useCallback(() => {
    if (validateName(name)) {
      setStep("description");
    }
  }, [name, validateName]);

  const handleDescriptionNext = useCallback(() => {
    if (validateDesc(description)) {
      setStep("options");
    }
  }, [description, validateDesc]);

  const handleCreate = useCallback(async () => {
    try {
      const result = await createSkill.mutateAsync({
        name,
        description,
        license: license || undefined,
        includeScripts,
        includeReferences,
        includeAssets,
      });
      setCreatedSkillDir(result.skillDir);
      setStep("success");
    } catch (error) {
      // Error is handled by mutation
      console.error("Failed to create skill:", error);
    }
  }, [name, description, license, includeScripts, includeReferences, includeAssets, createSkill]);

  const handleOpenDirectory = useCallback(() => {
    if (createdSkillDir) {
      openSkillDirectory.mutate(createdSkillDir);
    }
  }, [createdSkillDir, openSkillDirectory]);

  const renderStepIndicator = () => {
    const steps = ["name", "description", "options"];
    const currentIndex = steps.indexOf(step);
    
    if (step === "success") return null;

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((s, i) => (
          <div
            key={s}
            className={`w-2 h-2 rounded-full transition-colors ${
              i <= currentIndex ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>
    );
  };

  const renderNameStep = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("createSkill.nameLabel")}</label>
        <Input
          value={name}
          onChange={(e) => {
            const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
            setName(value);
            if (nameError) validateName(value);
          }}
          placeholder="my-awesome-skill"
          className={nameError ? "border-destructive" : ""}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleNameNext()}
        />
        {nameError && (
          <p className="text-sm text-destructive">{nameError}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {t("createSkill.nameHint")}
        </p>
      </div>
    </div>
  );

  const renderDescriptionStep = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("createSkill.descriptionLabel")}</label>
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (descriptionError) validateDesc(e.target.value);
          }}
          placeholder={t("createSkill.descriptionPlaceholder")}
          className={`w-full min-h-[120px] px-3 py-2 text-sm rounded-md border bg-background resize-none ${
            descriptionError ? "border-destructive" : "border-input"
          }`}
          autoFocus
        />
        {descriptionError && (
          <p className="text-sm text-destructive">{descriptionError}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {t("createSkill.descriptionHint")} ({description.length}/1024)
        </p>
      </div>
    </div>
  );

  const renderOptionsStep = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("createSkill.licenseLabel")}</label>
        <Input
          value={license}
          onChange={(e) => setLicense(e.target.value)}
          placeholder="MIT"
        />
        <p className="text-xs text-muted-foreground">
          {t("createSkill.licenseHint")}
        </p>
      </div>

      <div className="space-y-4">
        <label className="text-sm font-medium">{t("createSkill.resourcesLabel")}</label>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">scripts/</p>
            <p className="text-xs text-muted-foreground">
              {t("createSkill.scriptsHint")}
            </p>
          </div>
          <Switch
            checked={includeScripts}
            onCheckedChange={setIncludeScripts}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">references/</p>
            <p className="text-xs text-muted-foreground">
              {t("createSkill.referencesHint")}
            </p>
          </div>
          <Switch
            checked={includeReferences}
            onCheckedChange={setIncludeReferences}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">assets/</p>
            <p className="text-xs text-muted-foreground">
              {t("createSkill.assetsHint")}
            </p>
          </div>
          <Switch
            checked={includeAssets}
            onCheckedChange={setIncludeAssets}
          />
        </div>
      </div>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="space-y-4 text-center py-4">
      <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
        <svg
          className="w-8 h-8 text-green-600 dark:text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <div>
        <h3 className="text-lg font-semibold">{t("createSkill.successTitle")}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("createSkill.successMessage", { name })}
        </p>
      </div>
      <div className="bg-muted rounded-md p-3 text-left">
        <p className="text-xs font-mono break-all">{createdSkillDir}</p>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (step) {
      case "name":
        return renderNameStep();
      case "description":
        return renderDescriptionStep();
      case "options":
        return renderOptionsStep();
      case "success":
        return renderSuccessStep();
    }
  };

  const renderFooter = () => {
    switch (step) {
      case "name":
        return (
          <>
            <Button variant="outline" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleNameNext}>
              {t("common.next")}
            </Button>
          </>
        );
      case "description":
        return (
          <>
            <Button variant="outline" onClick={() => setStep("name")}>
              {t("common.back")}
            </Button>
            <Button onClick={handleDescriptionNext}>
              {t("common.next")}
            </Button>
          </>
        );
      case "options":
        return (
          <>
            <Button variant="outline" onClick={() => setStep("description")}>
              {t("common.back")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createSkill.isPending}
            >
              {createSkill.isPending ? t("common.creating") : t("createSkill.create")}
            </Button>
          </>
        );
      case "success":
        return (
          <>
            <Button variant="outline" onClick={handleOpenDirectory}>
              {t("createSkill.openDirectory")}
            </Button>
            <Button onClick={handleClose}>
              {t("common.done")}
            </Button>
          </>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {step === "success"
              ? t("createSkill.successTitle")
              : t("createSkill.title")}
          </DialogTitle>
        </DialogHeader>

        {renderStepIndicator()}

        <div className="py-4">
          {renderContent()}
        </div>

        {createSkill.isError && (
          <p className="text-sm text-destructive">
            {createSkill.error instanceof Error
              ? createSkill.error.message
              : t("createSkill.error")}
          </p>
        )}

        <DialogFooter>
          {renderFooter()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
