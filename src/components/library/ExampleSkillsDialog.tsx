import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useImportGitHubSkill } from "@/hooks";
import { 
  Loader2, 
  Check, 
  ExternalLink, 
  Code, 
  Palette, 
  TestTube,
  Sparkles,
  FileCode,
  Layers,
  AlertCircle
} from "lucide-react";

interface ExampleSkillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ExampleSkill {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  tags: string[];
  license: string;
}

// 官方示例技能列表（仅 Apache 2.0 许可的）
const EXAMPLE_SKILLS: ExampleSkill[] = [
  {
    id: "frontend-design",
    name: "Frontend Design",
    description: "Create distinctive, production-grade frontend interfaces with high design quality. Generates creative, polished code and UI design.",
    icon: <Palette className="w-5 h-5" />,
    path: "skills/frontend-design",
    tags: ["design", "frontend", "ui"],
    license: "Apache-2.0",
  },
  {
    id: "mcp-builder",
    name: "MCP Builder",
    description: "Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services.",
    icon: <Code className="w-5 h-5" />,
    path: "skills/mcp-builder",
    tags: ["mcp", "development", "api"],
    license: "Apache-2.0",
  },
  {
    id: "webapp-testing",
    name: "Web App Testing",
    description: "Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality.",
    icon: <TestTube className="w-5 h-5" />,
    path: "skills/webapp-testing",
    tags: ["testing", "playwright", "automation"],
    license: "Apache-2.0",
  },
  {
    id: "algorithmic-art",
    name: "Algorithmic Art",
    description: "Creating algorithmic art using p5.js with seeded randomness and interactive parameter exploration.",
    icon: <Sparkles className="w-5 h-5" />,
    path: "skills/algorithmic-art",
    tags: ["art", "generative", "p5js"],
    license: "Apache-2.0",
  },
  {
    id: "skill-creator",
    name: "Skill Creator",
    description: "Guide for creating effective skills. Use when users want to create a new skill that extends Claude's capabilities.",
    icon: <FileCode className="w-5 h-5" />,
    path: "skills/skill-creator",
    tags: ["meta", "skill", "guide"],
    license: "Apache-2.0",
  },
  {
    id: "theme-factory",
    name: "Theme Factory",
    description: "Create cohesive visual themes for presentations, documents, and web interfaces with consistent styling.",
    icon: <Layers className="w-5 h-5" />,
    path: "skills/theme-factory",
    tags: ["design", "theme", "styling"],
    license: "Apache-2.0",
  },
];

const GITHUB_REPO = {
  owner: "anthropics",
  repo: "skills",
  branch: "main",
};

export function ExampleSkillsDialog({ open, onOpenChange }: ExampleSkillsDialogProps) {
  const { t } = useTranslation();
  const importGitHubSkill = useImportGitHubSkill();
  
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImport = useCallback(async (skill: ExampleSkill) => {
    setImportingIds(prev => new Set(prev).add(skill.id));
    setErrors(prev => {
      const next = { ...prev };
      delete next[skill.id];
      return next;
    });

    try {
      await importGitHubSkill.mutateAsync({
        owner: GITHUB_REPO.owner,
        repo: GITHUB_REPO.repo,
        path: skill.path,
        branch: GITHUB_REPO.branch,
      });
      setImportedIds(prev => new Set(prev).add(skill.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      setErrors(prev => ({ ...prev, [skill.id]: message }));
    } finally {
      setImportingIds(prev => {
        const next = new Set(prev);
        next.delete(skill.id);
        return next;
      });
    }
  }, [importGitHubSkill]);

  const handleImportAll = useCallback(async () => {
    for (const skill of EXAMPLE_SKILLS) {
      if (!importedIds.has(skill.id) && !importingIds.has(skill.id)) {
        await handleImport(skill);
      }
    }
  }, [importedIds, importingIds, handleImport]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const importedCount = importedIds.size;
  const totalCount = EXAMPLE_SKILLS.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t("exampleSkills.title")}</DialogTitle>
          <DialogDescription>
            {t("exampleSkills.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 px-1 text-sm text-muted-foreground">
          <span>{t("exampleSkills.source")}</span>
          <a
            href="https://github.com/anthropics/skills"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            anthropics/skills
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-3">
            {EXAMPLE_SKILLS.map((skill) => {
              const isImporting = importingIds.has(skill.id);
              const isImported = importedIds.has(skill.id);
              const error = errors[skill.id];

              return (
                <div
                  key={skill.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    isImported
                      ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                      : "bg-muted/30 hover:bg-muted/50"
                  }`}
                >
                  <div className={`p-2 rounded-md ${
                    isImported 
                      ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                      : "bg-primary/10 text-primary"
                  }`}>
                    {isImported ? <Check className="w-5 h-5" /> : skill.icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm">{skill.name}</h4>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {skill.license}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {skill.description}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      {skill.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    {error && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-destructive">
                        <AlertCircle className="w-3 h-3" />
                        {error}
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant={isImported ? "ghost" : "secondary"}
                    disabled={isImporting || isImported}
                    onClick={() => handleImport(skill)}
                    className="shrink-0"
                  >
                    {isImporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isImported ? (
                      t("exampleSkills.imported")
                    ) : (
                      t("common.import")
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex-1 text-sm text-muted-foreground">
            {importedCount > 0 && (
              <span>{t("exampleSkills.importedCount", { count: importedCount, total: totalCount })}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              {t("common.close")}
            </Button>
            <Button
              onClick={handleImportAll}
              disabled={importedCount === totalCount || importingIds.size > 0}
            >
              {importingIds.size > 0 ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("exampleSkills.importing")}
                </>
              ) : (
                t("exampleSkills.importAll")
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
