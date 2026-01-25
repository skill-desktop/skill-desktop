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
import { Separator } from "@/components/ui/separator";
import { useCreateSkill, useOpenSkillDirectory } from "@/hooks";
import { validateSkillName, validateSkillDescription } from "@/types/skill";
import { AIEnhanceDialog, type EnhanceType } from "./AIEnhanceDialog";
import { Sparkles, FolderOpen, Check, ChevronRight, ChevronLeft, LayoutGrid, FileText, Settings, PartyPopper, AlertCircle, FileCode, BookOpen } from "lucide-react";

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

  const steps = [
    { key: "name", label: t("createSkill.stepName"), icon: LayoutGrid },
    { key: "description", label: t("createSkill.stepDescription"), icon: FileText },
    { key: "options", label: t("createSkill.stepOptions"), icon: Settings },
  ] as const;

  const currentStepIndex = steps.findIndex(s => s.key === step);

  const renderStepIndicator = () => {
    if (step === "success") return null;

    return (
      <div className="px-6 py-4 border-b border-border-default bg-bg-secondary/30">
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => {
            const isCompleted = i < currentStepIndex;
            const isCurrent = i === currentStepIndex;
            const Icon = s.icon;
            
            return (
              <div key={s.key} className="flex items-center">
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isCurrent
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : isCompleted
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{s.label}</span>
                  {isCompleted && <Check className="w-3 h-3 ml-1 opacity-50" />}
                </div>
                {i < steps.length - 1 && (
                  <div className="w-6 h-px bg-border-default mx-1" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderNameStep = () => (
    <div className="space-y-6 py-4 animate-in fade-in slide-in-from-right-4 duration-200">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{t("createSkill.nameLabel")}</label>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-accent-blue hover:text-accent-blue hover:bg-accent-blue/10"
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
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {nameError}
          </p>
        )}
        <p className="text-xs text-text-muted">
          {t("createSkill.nameHint")}
        </p>
      </div>

      {name && !nameError && (
        <div className="p-3 bg-bg-secondary rounded-md border border-border-default">
          <p className="text-xs text-text-muted mb-1.5">{t("createSkill.preview")}</p>
          <div className="flex items-center gap-2 text-sm font-mono text-text-primary">
            <FolderOpen className="w-4 h-4 text-accent-blue" />
            <span>{name}/SKILL.md</span>
          </div>
        </div>
      )}
    </div>
  );

  const renderDescriptionStep = () => (
    <div className="space-y-6 py-4 animate-in fade-in slide-in-from-right-4 duration-200">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{t("createSkill.descriptionLabel")}</label>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-accent-blue hover:text-accent-blue hover:bg-accent-blue/10"
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
          className={`w-full min-h-[160px] px-3 py-2 text-sm rounded-md border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring ${
            descriptionError ? "border-destructive" : "border-input"
          }`}
          autoFocus
        />
        {descriptionError && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {descriptionError}
          </p>
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            {t("createSkill.descriptionHint")}
          </p>
          <p className={`text-xs font-mono ${description.length > 1024 ? "text-destructive" : "text-text-muted"}`}>
            {description.length}/1024
          </p>
        </div>
      </div>
    </div>
  );

  const renderOptionsStep = () => (
    <div className="space-y-6 py-4 animate-in fade-in slide-in-from-right-4 duration-200">
      <div className="space-y-3">
        <label className="text-sm font-medium">{t("createSkill.licenseLabel")}</label>
        <Input
          value={license}
          onChange={(e) => setLicense(e.target.value)}
          placeholder="MIT"
        />
        <p className="text-xs text-text-muted">
          {t("createSkill.licenseHint")}
        </p>
      </div>

      <Separator />

      <div className="space-y-4">
        <label className="text-sm font-medium">{t("createSkill.resourcesLabel")}</label>
        
        <div className="grid gap-3">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-bg-secondary/30 hover:bg-bg-secondary/50 transition-colors">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <FileCode className="w-4 h-4 text-accent-yellow" />
                <p className="text-sm font-medium font-mono">scripts/</p>
              </div>
              <p className="text-xs text-text-muted">
                {t("createSkill.scriptsHint")}
              </p>
            </div>
            <Switch
              checked={includeScripts}
              onCheckedChange={setIncludeScripts}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-bg-secondary/30 hover:bg-bg-secondary/50 transition-colors">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <BookOpen className="w-4 h-4 text-accent-purple" />
                <p className="text-sm font-medium font-mono">references/</p>
              </div>
              <p className="text-xs text-text-muted">
                {t("createSkill.referencesHint")}
              </p>
            </div>
            <Switch
              checked={includeReferences}
              onCheckedChange={setIncludeReferences}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-bg-secondary/30 hover:bg-bg-secondary/50 transition-colors">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <LayoutGrid className="w-4 h-4 text-accent-blue" />
                <p className="text-sm font-medium font-mono">assets/</p>
              </div>
              <p className="text-xs text-text-muted">
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
    </div>
  );

  const renderSuccessStep = () => (
    <div className="flex flex-col items-center justify-center py-8 space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="relative">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center animate-bounce-subtle">
          <Check className="w-10 h-10 text-green-600 dark:text-green-500" />
        </div>
        <div className="absolute -inset-4 bg-green-100/30 dark:bg-green-900/10 rounded-full blur-xl -z-10" />
        <div className="absolute top-0 right-0">
          <PartyPopper className="w-6 h-6 text-accent-yellow animate-pulse" />
        </div>
      </div>
      
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold tracking-tight">{t("createSkill.successTitle")}</h3>
        <p className="text-text-muted max-w-xs mx-auto text-sm">
          {t("createSkill.successMessage", { name })}
        </p>
      </div>

      <div className="w-full bg-bg-secondary rounded-lg p-4 border border-border-default space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wider">
          <FolderOpen className="w-3.5 h-3.5" />
          {t("createSkill.location")}
        </div>
        <code className="block text-sm font-mono break-all bg-bg-tertiary p-2 rounded border border-border-muted select-all">
          {createdSkillDir}
        </code>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (step) {
      case "name": return renderNameStep();
      case "description": return renderDescriptionStep();
      case "options": return renderOptionsStep();
      case "success": return renderSuccessStep();
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
              className="min-w-[100px]"
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
        <DialogContent className="sm:max-w-[550px] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-border-default bg-bg-secondary/50">
            <DialogTitle>
              {step === "success"
                ? t("createSkill.successTitle")
                : t("createSkill.title")}
            </DialogTitle>
          </DialogHeader>

          {renderStepIndicator()}

          <div className="px-6 min-h-[300px] flex flex-col justify-center">
            {renderContent()}
          </div>

          {createSkill.isError && (
            <div className="px-6 pb-2">
              <p className="text-sm text-destructive bg-destructive/10 p-2 rounded-md border border-destructive/20 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {createSkill.error instanceof Error
                  ? createSkill.error.message
                  : t("createSkill.error")}
              </p>
            </div>
          )}

          <DialogFooter className="px-6 py-4 border-t border-border-default bg-bg-secondary/50">
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
