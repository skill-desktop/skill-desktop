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
import { AIEnhanceDialog, type EnhanceType } from "./AIEnhanceDialog";
import { Sparkles, FolderOpen, Check, ChevronRight, ChevronLeft } from "lucide-react";

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
  const [license, setLicense] = useState("MIT");
  const [includeScripts, setIncludeScripts] = useState(true);
  const [includeReferences, setIncludeReferences] = useState(true);
  const [includeAssets, setIncludeAssets] = useState(false);

  // Validation state
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  // Result state
  const [createdSkillDir, setCreatedSkillDir] = useState<string | null>(null);

  // AI Enhance dialog state
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiEnhanceType, setAiEnhanceType] = useState<EnhanceType>("name");

  const resetForm = useCallback(() => {
    setStep("name");
    setName("");
    setDescription("");
    setLicense("MIT");
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

  const openAIEnhance = useCallback((type: EnhanceType) => {
    setAiEnhanceType(type);
    setAiDialogOpen(true);
  }, []);

  const handleAIApply = useCallback((value: string) => {
    if (aiEnhanceType === "name") {
      // Clean and format the name
      const cleanName = value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      setName(cleanName);
      setNameError(null);
    } else if (aiEnhanceType === "description") {
      setDescription(value);
      setDescriptionError(null);
    }
  }, [aiEnhanceType]);

  const renderStepIndicator = () => {
    const steps = [
      { key: "name", label: t("createSkill.stepName") },
      { key: "description", label: t("createSkill.stepDescription") },
      { key: "options", label: t("createSkill.stepOptions") },
    ];
    const currentIndex = steps.findIndex(s => s.key === step);
    
    if (step === "success") return null;

    return (
      <div className="flex items-center justify-center gap-1 mb-6">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                i < currentIndex
                  ? "bg-primary text-primary-foreground"
                  : i === currentIndex
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < currentIndex ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-12 h-0.5 mx-1 transition-colors ${
                  i < currentIndex ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderNameStep = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{t("createSkill.nameLabel")}</label>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => openAIEnhance("name")}
          >
            <Sparkles className="w-3 h-3" />
            {t("createSkill.aiGenerate")}
          </Button>
        </div>
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

      {/* Preview */}
      {name && (
        <div className="p-3 bg-muted/50 rounded-md border">
          <p className="text-xs text-muted-foreground mb-1">{t("createSkill.preview")}</p>
          <p className="text-sm font-mono">{name}/SKILL.md</p>
        </div>
      )}
    </div>
  );

  const renderDescriptionStep = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{t("createSkill.descriptionLabel")}</label>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => openAIEnhance("description")}
          >
            <Sparkles className="w-3 h-3" />
            {t("createSkill.aiEnhance")}
          </Button>
        </div>
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (descriptionError) validateDesc(e.target.value);
          }}
          placeholder={t("createSkill.descriptionPlaceholder")}
          className={`w-full min-h-[140px] px-3 py-2 text-sm rounded-md border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring ${
            descriptionError ? "border-destructive" : "border-input"
          }`}
          autoFocus
        />
        {descriptionError && (
          <p className="text-sm text-destructive">{descriptionError}</p>
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t("createSkill.descriptionHint")}
          </p>
          <p className={`text-xs ${description.length > 1024 ? "text-destructive" : "text-muted-foreground"}`}>
            {description.length}/1024
          </p>
        </div>
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
        
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <div className="flex-1">
              <p className="text-sm font-medium font-mono">scripts/</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("createSkill.scriptsHint")}
              </p>
            </div>
            <Switch
              checked={includeScripts}
              onCheckedChange={setIncludeScripts}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <div className="flex-1">
              <p className="text-sm font-medium font-mono">references/</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("createSkill.referencesHint")}
              </p>
            </div>
            <Switch
              checked={includeReferences}
              onCheckedChange={setIncludeReferences}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <div className="flex-1">
              <p className="text-sm font-medium font-mono">assets/</p>
              <p className="text-xs text-muted-foreground mt-0.5">
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

      {/* Preview structure */}
      <div className="p-3 bg-muted/50 rounded-md border">
        <p className="text-xs text-muted-foreground mb-2">{t("createSkill.structurePreview")}</p>
        <div className="text-sm font-mono space-y-0.5">
          <p>{name}/</p>
          <p className="pl-4">├── SKILL.md</p>
          {license && <p className="pl-4">├── LICENSE.txt</p>}
          {includeScripts && (
            <>
              <p className="pl-4">├── scripts/</p>
              <p className="pl-8 text-muted-foreground">└── example.py</p>
            </>
          )}
          {includeReferences && (
            <>
              <p className="pl-4">├── references/</p>
              <p className="pl-8 text-muted-foreground">└── api_reference.md</p>
            </>
          )}
          {includeAssets && (
            <>
              <p className="pl-4">└── assets/</p>
              <p className="pl-8 text-muted-foreground">└── example_asset.txt</p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="space-y-6 text-center py-6">
      <div className="w-20 h-20 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
        <Check className="w-10 h-10 text-green-600 dark:text-green-400" />
      </div>
      <div>
        <h3 className="text-xl font-semibold">{t("createSkill.successTitle")}</h3>
        <p className="text-sm text-muted-foreground mt-2">
          {t("createSkill.successMessage", { name })}
        </p>
      </div>
      <div className="bg-muted rounded-md p-4 text-left">
        <p className="text-xs text-muted-foreground mb-1">{t("createSkill.location")}</p>
        <p className="text-sm font-mono break-all">{createdSkillDir}</p>
      </div>
      <div className="text-sm text-muted-foreground">
        <p>{t("createSkill.nextSteps")}</p>
        <ul className="mt-2 space-y-1 text-left list-disc list-inside">
          <li>{t("createSkill.nextStep1")}</li>
          <li>{t("createSkill.nextStep2")}</li>
          <li>{t("createSkill.nextStep3")}</li>
        </ul>
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
            <Button onClick={handleNameNext} disabled={!name}>
              {t("common.next")}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </>
        );
      case "description":
        return (
          <>
            <Button variant="outline" onClick={() => setStep("name")}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t("common.back")}
            </Button>
            <Button onClick={handleDescriptionNext} disabled={!description}>
              {t("common.next")}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </>
        );
      case "options":
        return (
          <>
            <Button variant="outline" onClick={() => setStep("description")}>
              <ChevronLeft className="w-4 h-4 mr-1" />
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
              <FolderOpen className="w-4 h-4 mr-2" />
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
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {step === "success"
                ? t("createSkill.successTitle")
                : t("createSkill.title")}
            </DialogTitle>
          </DialogHeader>

          {renderStepIndicator()}

          <div className="py-2">
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

      <AIEnhanceDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        type={aiEnhanceType}
        currentValue={aiEnhanceType === "name" ? name : description}
        skillName={name}
        onApply={handleAIApply}
      />
    </>
  );
}
