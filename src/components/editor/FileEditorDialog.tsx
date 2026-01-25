import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import Editor, { OnMount } from "@monaco-editor/react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useReadTextFile, useSaveTextFile } from "@/hooks/useFileOperations";
import { Loader2, Save } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";

// Get language from file extension
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    'md': 'markdown',
    'markdown': 'markdown',
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'json': 'json',
    'py': 'python',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'yaml': 'yaml',
    'yml': 'yaml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'xml': 'xml',
    'sql': 'sql',
    'rs': 'rust',
    'go': 'go',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'rb': 'ruby',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
    'toml': 'toml',
    'ini': 'ini',
    'txt': 'plaintext',
  };
  return languageMap[ext || ''] || 'plaintext';
}

interface FileEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string;
  title?: string;
  language?: string;
}

export function FileEditorDialog({
  open,
  onOpenChange,
  filePath,
  title,
  language = "markdown",
}: FileEditorDialogProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [isModified, setIsModified] = useState(false);
  const editorRef = useRef<any>(null);
  
  const readTextFile = useReadTextFile();
  const saveTextFile = useSaveTextFile();

  // Load content when dialog opens
  useEffect(() => {
    if (open && filePath) {
      readTextFile.mutate(filePath, {
        onSuccess: (data) => {
          setContent(data);
          setIsModified(false);
        },
        onError: (error) => {
          console.error("Failed to read file:", error);
        }
      });
    }
  }, [open, filePath]);

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  // Detect language from file path
  const detectedLanguage = language !== "markdown" ? language : getLanguageFromPath(filePath);

  const handleSave = async () => {
    if (!filePath) return;

    try {
      await saveTextFile.mutateAsync({ path: filePath, content });
      setIsModified(false);
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  };

  const handleClose = () => {
    if (isModified) {
      // Could show a confirmation dialog here
      if (!confirm(t("common.unsavedChanges", "You have unsaved changes. Are you sure you want to close?"))) {
        return;
      }
    }
    onOpenChange(false);
  };

  const { theme } = useSettingsStore();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center justify-between text-base">
            <span className="truncate flex-1" title={filePath}>
              {title || filePath.split('/').pop()}
            </span>
            {isModified && (
              <span className="text-xs text-muted-foreground ml-2 px-2 py-0.5 rounded-full bg-accent/50">
                Modified
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-[#1e1e1e] relative">
          {readTextFile.isPending ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Editor
              height="100%"
              language={detectedLanguage}
              value={content}
              theme={isDark ? "vs-dark" : "light"}
              onChange={(value) => {
                setContent(value || "");
                setIsModified(true);
              }}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                fontSize: 14,
                wordWrap: "on",
              }}
            />
          )}
        </div>

        <DialogFooter className="px-4 py-3 border-t bg-muted/20">
          <div className="flex w-full justify-between items-center">
             <div className="text-xs text-muted-foreground truncate max-w-[50%]">
                {filePath}
             </div>
             <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  {t("common.close", "Close")}
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleSave} 
                  disabled={!isModified || saveTextFile.isPending}
                >
                  {saveTextFile.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {t("common.save", "Save")}
                </Button>
             </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
