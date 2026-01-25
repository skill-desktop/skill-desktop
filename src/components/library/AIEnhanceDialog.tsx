import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useChatCompletion } from "@/hooks/useLLM";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";

export type EnhanceType = "name" | "description" | "skillContent";

interface AIEnhanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: EnhanceType;
  currentValue: string;
  skillName?: string;
  onApply: (value: string) => void;
}

// AI 提示词模板
const PROMPTS: Record<EnhanceType, { system: string; userTemplate: string }> = {
  name: {
    system: `You are a helpful assistant that generates skill names for AI agent skills.
The name must follow these rules:
- 1-64 characters
- Lowercase letters, numbers, and hyphens only
- Cannot start or end with a hyphen
- Cannot contain consecutive hyphens
- Should be descriptive and memorable

Output ONLY the skill name, nothing else. No explanations, no quotes, just the name.`,
    userTemplate: `Generate a good skill name based on this description: "{input}"

The name should be concise, descriptive, and follow the naming conventions.`,
  },
  description: {
    system: `You are a helpful assistant that writes skill descriptions for AI agent skills.
The description must follow these rules:
- 1-1024 characters
- Cannot contain angle brackets (< or >)
- Should clearly explain what the skill does
- Should explain WHEN to use this skill (this is the primary trigger)
- Should be comprehensive but concise

Output ONLY the description text, nothing else. No explanations, no quotes.`,
    userTemplate: `Write a comprehensive skill description based on this input: "{input}"

The description should:
1. Clearly explain what the skill does
2. Explain when Claude should use this skill (specific scenarios, triggers)
3. Be professional and well-written
4. Be under 1024 characters`,
  },
  skillContent: {
    system: `You are a helpful assistant that generates SKILL.md content for AI agent skills.
The content should follow the Agent Skills specification:
- Start with YAML frontmatter (name, description, license)
- Include clear sections: Overview, Workflow, Resources
- Be concise but comprehensive
- Focus on procedural knowledge that helps Claude execute tasks

Output ONLY the SKILL.md content, starting with ---.`,
    userTemplate: `Generate a complete SKILL.md file for a skill named "{skillName}".

Based on this description: "{input}"

Include:
1. YAML frontmatter with name, description, and license (MIT)
2. Overview section explaining what the skill does
3. Workflow section with step-by-step instructions
4. Resources section describing available scripts/references/assets

Make it professional and follow the Agent Skills specification.`,
  },
};

export function AIEnhanceDialog({
  open,
  onOpenChange,
  type,
  currentValue,
  skillName,
  onApply,
}: AIEnhanceDialogProps) {
  const { t } = useTranslation();
  const { sendMessage, isLoading, error, hasProvider, reset } = useChatCompletion();
  
  const [input, setInput] = useState(currentValue);
  const [result, setResult] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!input.trim()) return;
    
    const prompt = PROMPTS[type];
    const userMessage = prompt.userTemplate
      .replace("{input}", input)
      .replace("{skillName}", skillName || "");
    
    const response = await sendMessage(userMessage, {
      systemPrompt: prompt.system,
      temperature: 0.7,
      maxTokens: type === "skillContent" ? 2000 : 500,
    });
    
    if (response?.content) {
      // Clean up the response
      let content = response.content.trim();
      // Remove quotes if present
      if ((content.startsWith('"') && content.endsWith('"')) ||
          (content.startsWith("'") && content.endsWith("'"))) {
        content = content.slice(1, -1);
      }
      setResult(content);
    }
  }, [input, type, skillName, sendMessage]);

  const handleApply = useCallback(() => {
    if (result) {
      onApply(result);
      handleClose();
    }
  }, [result, onApply]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Reset after close
    setTimeout(() => {
      setInput(currentValue);
      setResult(null);
      reset();
    }, 300);
  }, [onOpenChange, currentValue, reset]);

  const getTitle = () => {
    switch (type) {
      case "name":
        return t("aiEnhance.generateName");
      case "description":
        return t("aiEnhance.generateDescription");
      case "skillContent":
        return t("aiEnhance.generateContent");
    }
  };

  const getPlaceholder = () => {
    switch (type) {
      case "name":
        return t("aiEnhance.namePlaceholder");
      case "description":
        return t("aiEnhance.descriptionPlaceholder");
      case "skillContent":
        return t("aiEnhance.contentPlaceholder");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {getTitle()}
          </DialogTitle>
          <DialogDescription>
            {t("aiEnhance.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!hasProvider && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">{t("aiEnhance.noProvider")}</p>
                <p className="text-amber-600 dark:text-amber-400 mt-1">
                  {t("aiEnhance.noProviderHint")}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("aiEnhance.inputLabel")}</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={getPlaceholder()}
              className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={!hasProvider || isLoading}
            />
          </div>

          {result && (
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("aiEnhance.resultLabel")}</label>
              <div className="p-3 bg-muted rounded-md">
                <pre className="text-sm whitespace-pre-wrap font-mono">
                  {result}
                </pre>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          {result ? (
            <Button onClick={handleApply}>
              {t("aiEnhance.apply")}
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={!hasProvider || isLoading || !input.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("aiEnhance.generating")}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {t("aiEnhance.generate")}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
