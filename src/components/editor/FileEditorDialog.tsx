import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import Editor, { OnMount } from "@monaco-editor/react";
import { 
  Dialog, 
  DialogContent
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useReadTextFile, useSaveTextFile } from "@/hooks/useFileOperations";
import { Loader2, Save, FileCode2, Terminal, FileText, FileJson, File, X } from "lucide-react";
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

// Get icon based on language/extension
function getFileIcon(language: string) {
  switch (language) {
    case 'python':
    case 'javascript':
    case 'typescript':
    case 'rust':
    case 'go':
    case 'c':
    case 'cpp':
    case 'java':
      return <FileCode2 className="w-4 h-4 text-blue-500" />;
    case 'shell':
      return <Terminal className="w-4 h-4 text-green-500" />;
    case 'json':
    case 'yaml':
    case 'xml':
    case 'toml':
    case 'ini':
      return <FileJson className="w-4 h-4 text-orange-500" />;
    case 'markdown':
    case 'plaintext':
      return <FileText className="w-4 h-4 text-gray-500" />;
    default:
      return <File className="w-4 h-4 text-gray-500" />;
  }
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
  const fileName = title || filePath.split('/').pop() || "Untitled";

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
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-none shadow-2xl bg-bg-secondary">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-bg-secondary">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-bg-tertiary border border-border-muted shrink-0">
              {getFileIcon(detectedLanguage)}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary truncate" title={filePath}>
                  {fileName}
                </span>
                {isModified && (
                  <span className="w-2 h-2 rounded-full bg-accent-yellow animate-pulse shrink-0" title="Unsaved changes" />
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Badge variant="outline" className="h-4 px-1 py-0 text-[10px] font-normal border-border-muted text-text-secondary rounded-sm">
                  {detectedLanguage}
                </Badge>
                <span className="truncate opacity-60 direction-rtl" title={filePath}>
                  {filePath}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleClose}
              className="h-8 w-8 text-text-muted hover:text-text-primary"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 min-h-0 relative bg-[#1e1e1e]">
          {readTextFile.isPending ? (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-secondary/50 z-10 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-accent-blue" />
                <span className="text-sm text-text-muted">Loading file...</span>
              </div>
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
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                fontLigatures: true,
                wordWrap: "on",
                padding: { top: 16, bottom: 16 },
                lineNumbers: "on",
                renderLineHighlight: "all",
                smoothScrolling: true,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border-default bg-bg-tertiary">
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isModified ? 'bg-accent-yellow' : 'bg-accent-green'}`} />
              <span>{isModified ? "Unsaved" : "Saved"}</span>
            </div>
            {content.length > 0 && (
              <div className="hidden sm:block">
                {content.split('\n').length} lines
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClose}
              className="text-text-secondary hover:text-text-primary"
            >
              {t("common.close", "Close")}
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave} 
              disabled={!isModified || saveTextFile.isPending}
              className={isModified ? "bg-accent-blue hover:bg-accent-blue/90 text-white" : ""}
            >
              {saveTextFile.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 mr-1.5" />
              )}
              {t("common.save", "Save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
