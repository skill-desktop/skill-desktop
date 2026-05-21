import React from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  FolderInput,
  FileArchive,
  Folder,
  FileText,
  Loader2,
  Upload,
  AlertTriangle,
  Download,
  CheckCircle,
  XCircle,
  ScanLine,
  Trash2,
} from "lucide-react";
import { Button, ScrollArea, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { LocalSkillCandidate, LocalSourceType } from "@/hooks/useLocalImport";

/**
 * One row in the local-import candidate list. Created either by the OS dialog
 * (file/folder picker), the drag-drop handler, or the recursive scan.
 *
 * For files/folders picked directly, the user-provided path goes in
 * `sourcePath`. The remaining fields are populated lazily after we call
 * `preview_local_skill` on each path (so the list shows up immediately even
 * before we've parsed the SKILL.md).
 */
type Row = LocalSkillCandidate & {
  /** Stable row key — used for selection set membership. */
  id: string;
  /** True while we're loading metadata for this row. */
  loading?: boolean;
};

interface LocalImportPanelProps {
  libraryPath: string;
  /** Called when the user clicks the per-row Preview button. */
  onPreviewCandidate: (path: string) => Promise<void>;
  /** Called when the user clicks "Import All Selected" — receives the chosen paths. */
  onImportSelected: (paths: string[]) => Promise<void>;
  /** Whether a batch import is currently in flight (drives the import button state). */
  isImporting: boolean;
  /** Result of the last batch import; cleared by the parent. */
  lastImportResult: { imported: number; skipped: number; failed: number } | null;
}

export const LocalImportPanel: React.FC<LocalImportPanelProps> = ({
  libraryPath,
  onPreviewCandidate,
  onImportSelected,
  isImporting,
  lastImportResult,
}) => {
  const { t } = useTranslation();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = React.useState(false);
  const [isDraggingOver, setIsDraggingOver] = React.useState(false);

  // Helper: turn one or more user-supplied paths into rows, then resolve metadata.
  const addPaths = React.useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;

    const newRows: Row[] = paths.map((p) => ({
      id: p,
      sourcePath: p,
      sourceType: inferSourceTypeFromPath(p),
      skillMdPath: p,
      skillDir: p,
      name: basename(p),
      safeName: "",
      description: "",
      valid: false,
      loading: true,
    }));

    setRows((prev) => mergeRows(prev, newRows));
    setSelected((prev) => {
      const next = new Set(prev);
      newRows.forEach((r) => next.add(r.id));
      return next;
    });

    // Resolve metadata for each path in parallel. We use `preview_local_skill`
    // because it already handles all four source types (folder/zip/skill/md).
    // On any error we just leave `valid: false` with the error message.
    await Promise.all(
      newRows.map(async (row) => {
        try {
          const preview = await invoke<{
            metadata: {
              name: string;
              description: string;
            };
          }>("preview_local_skill", { path: row.sourcePath });

          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    name: preview.metadata.name || basename(row.sourcePath),
                    safeName: preview.metadata.name || "",
                    description: preview.metadata.description || "",
                    valid: true,
                    loading: false,
                    error: undefined,
                  }
                : r
            )
          );
        } catch (err) {
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    valid: false,
                    loading: false,
                    error: err instanceof Error ? err.message : String(err),
                  }
                : r
            )
          );
        }
      })
    );
  }, []);

  // Subscribe to Tauri's native file drop event. We accept dropped folders,
  // .zip/.skill files, or loose .md files; anything else is silently ignored
  // (the backend rejects unrecognised extensions anyway).
  React.useEffect(() => {
    const unlistenPromises: Array<Promise<() => void>> = [];

    unlistenPromises.push(
      listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
        setIsDraggingOver(false);
        const paths = event.payload?.paths ?? [];
        if (paths.length > 0) {
          void addPaths(paths);
        }
      })
    );

    // Drag-over / leave events let us highlight the drop zone.
    unlistenPromises.push(
      listen("tauri://drag-enter", () => setIsDraggingOver(true))
    );
    unlistenPromises.push(
      listen("tauri://drag-leave", () => setIsDraggingOver(false))
    );

    return () => {
      unlistenPromises.forEach((p) => {
        void p.then((un) => un());
      });
    };
  }, [addPaths]);

  // ===== Action handlers =====

  const handleSelectFiles = async () => {
    try {
      const result = await invoke<string | string[] | null>("plugin:dialog|open", {
        options: {
          multiple: true,
          title: t("localImport.selectFilesTitle"),
          filters: [
            {
              name: "Skill Package",
              extensions: ["zip", "skill", "md"],
            },
          ],
        },
      });
      const paths = normalizeDialogResult(result);
      if (paths.length > 0) {
        await addPaths(paths);
      }
    } catch (e) {
      console.error("File picker failed:", e);
    }
  };

  const handleSelectFolders = async () => {
    try {
      const result = await invoke<string | string[] | null>("plugin:dialog|open", {
        options: {
          directory: true,
          multiple: true,
          title: t("localImport.selectFolderTitle"),
        },
      });
      const paths = normalizeDialogResult(result);
      if (paths.length > 0) {
        await addPaths(paths);
      }
    } catch (e) {
      console.error("Folder picker failed:", e);
    }
  };

  const handleScanFolder = async () => {
    try {
      const result = await invoke<string | null>("plugin:dialog|open", {
        options: {
          directory: true,
          multiple: false,
          title: t("localImport.scanFolderTitle"),
        },
      });
      if (!result || typeof result !== "string") return;

      setIsScanning(true);
      try {
        const candidates = await invoke<LocalSkillCandidate[]>(
          "scan_directory_for_skills",
          { path: result }
        );

        const newRows: Row[] = candidates.map((c) => ({
          ...c,
          id: c.skillDir, // skillDir is unique per candidate
          loading: false,
        }));
        setRows((prev) => mergeRows(prev, newRows));
        setSelected((prev) => {
          const next = new Set(prev);
          newRows.filter((r) => r.valid).forEach((r) => next.add(r.id));
          return next;
        });
      } finally {
        setIsScanning(false);
      }
    } catch (e) {
      console.error("Scan folder failed:", e);
      setIsScanning(false);
    }
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const clearAll = () => {
    setRows([]);
    setSelected(new Set());
  };

  const handleImport = async () => {
    // For scanned candidates, the ingestible path is `skillDir`. For dropped /
    // picked items, the ingestible path is the original `sourcePath`. We send
    // whichever one the backend can parse — both go through the same
    // `import_local_skills_batch` command on the Rust side.
    const paths = rows
      .filter((r) => selected.has(r.id) && r.valid)
      .map((r) => (r.sourceType === "folder" && r.skillDir !== r.sourcePath
        ? r.skillDir
        : r.sourcePath));
    if (paths.length === 0) return;

    await onImportSelected(paths);

    // Clear successfully-imported rows from the list. The backend doesn't
    // return per-path success, so we conservatively keep rows whose import
    // would still be useful to the user (i.e. nothing — clear everything).
    clearAll();
  };

  const validCount = rows.filter((r) => r.valid).length;
  const selectedCount = rows.filter((r) => selected.has(r.id) && r.valid).length;

  return (
    <div className="space-y-3">
      {!libraryPath && (
        <div className="flex items-start gap-2 text-xs text-accent-yellow">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{t("hub.warnings.setLibraryPath")}</span>
        </div>
      )}

      {/* Drop zone */}
      <div
        className={cn(
          "rounded-lg border-2 border-dashed transition-colors p-6 text-center",
          isDraggingOver
            ? "border-accent-blue bg-accent-blue/5"
            : "border-border-default bg-bg-secondary/30"
        )}
      >
        <Upload className="h-7 w-7 mx-auto mb-2 text-text-muted" />
        <p className="text-sm text-text-primary font-medium mb-1">
          {t("localImport.dropZone.title")}
        </p>
        <p className="text-xs text-text-muted">
          {t("localImport.dropZone.subtitle")}
        </p>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSelectFiles}
          disabled={!libraryPath}
          className="text-xs"
        >
          <FileArchive className="h-3.5 w-3.5 mr-1.5" />
          {t("localImport.selectFiles")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSelectFolders}
          disabled={!libraryPath}
          className="text-xs"
        >
          <FolderInput className="h-3.5 w-3.5 mr-1.5" />
          {t("localImport.selectFolder")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleScanFolder}
          disabled={!libraryPath || isScanning}
          className="text-xs"
        >
          {isScanning ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <ScanLine className="h-3.5 w-3.5 mr-1.5" />
          )}
          {t("localImport.scanFolder")}
        </Button>
      </div>

      <div className="flex items-start gap-2 text-xs text-text-muted">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{t("hub.warnings.verifySource")}</span>
      </div>

      {/* Candidate list */}
      {rows.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-muted">
              {t("localImport.candidatesCount", {
                valid: validCount,
                total: rows.length,
              })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={clearAll}
            >
              {t("localImport.clearAll")}
            </Button>
          </div>

          <ScrollArea className="h-48 rounded-md border border-border-default">
            <div className="divide-y divide-border-muted">
              {rows.map((row) => (
                <CandidateRow
                  key={row.id}
                  row={row}
                  isSelected={selected.has(row.id)}
                  onToggle={() => toggleRow(row.id)}
                  onPreview={() => onPreviewCandidate(row.sourcePath)}
                  onRemove={() => removeRow(row.id)}
                />
              ))}
            </div>
          </ScrollArea>

          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              className="flex-1"
              onClick={handleImport}
              disabled={selectedCount === 0 || isImporting}
            >
              {isImporting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t("localImport.importSelected", { count: selectedCount })}
            </Button>
          </div>

          {lastImportResult && (
            <div className="text-xs mt-2 space-y-0.5">
              <div className="text-accent-green flex items-center gap-1.5">
                <CheckCircle className="h-3 w-3" />
                {t("localImport.result.imported", { count: lastImportResult.imported })}
              </div>
              {lastImportResult.skipped > 0 && (
                <div className="text-text-muted">
                  {t("localImport.result.skipped", { count: lastImportResult.skipped })}
                </div>
              )}
              {lastImportResult.failed > 0 && (
                <div className="text-accent-red flex items-center gap-1.5">
                  <XCircle className="h-3 w-3" />
                  {t("localImport.result.failed", { count: lastImportResult.failed })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface CandidateRowProps {
  row: Row;
  isSelected: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onRemove: () => void;
}

const CandidateRow: React.FC<CandidateRowProps> = ({
  row,
  isSelected,
  onToggle,
  onPreview,
  onRemove,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-tertiary",
        isSelected && row.valid && "bg-accent-blue/10",
        !row.valid && "opacity-70"
      )}
    >
      <input
        type="checkbox"
        checked={isSelected && row.valid}
        onChange={onToggle}
        disabled={!row.valid}
        className="h-3.5 w-3.5 shrink-0"
      />

      <SourceTypeIcon type={row.sourceType} />

      <button
        type="button"
        className="flex-1 min-w-0 text-left"
        onClick={onPreview}
        disabled={row.loading || !row.valid}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary truncate">
            {row.loading ? t("common.loading") : row.name || row.sourcePath}
          </span>
          <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 shrink-0">
            {row.sourceType}
          </Badge>
        </div>
        <div className="text-[10px] text-text-muted truncate" title={row.sourcePath}>
          {row.sourcePath}
        </div>
        {row.error && (
          <div className="text-[10px] text-accent-red truncate mt-0.5" title={row.error}>
            {row.error}
          </div>
        )}
      </button>

      <button
        type="button"
        className="text-text-muted hover:text-accent-red shrink-0 p-1"
        onClick={onRemove}
        aria-label={t("common.delete")}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
};

const SourceTypeIcon: React.FC<{ type: LocalSourceType }> = ({ type }) => {
  switch (type) {
    case "folder":
      return <Folder className="h-3.5 w-3.5 text-accent-yellow shrink-0" />;
    case "zip":
    case "skill":
      return <FileArchive className="h-3.5 w-3.5 text-accent-purple shrink-0" />;
    case "markdown":
      return <FileText className="h-3.5 w-3.5 text-accent-blue shrink-0" />;
  }
};

// ===== Helpers =====

function normalizeDialogResult(result: string | string[] | null): string[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  return [result];
}

function basename(path: string): string {
  // Handle both POSIX and Windows separators since Tauri can be on either.
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function inferSourceTypeFromPath(path: string): LocalSourceType {
  const lower = path.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".skill")) return "skill";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  // Default to folder; the backend will reject anything actually unsupported.
  return "folder";
}

/**
 * Merge new rows into an existing list, de-duplicating by `id` (so dragging the
 * same file twice doesn't add it twice). Preserves the order of existing rows
 * and appends new ones to the end.
 */
function mergeRows(existing: Row[], incoming: Row[]): Row[] {
  const seen = new Set(existing.map((r) => r.id));
  const additions = incoming.filter((r) => !seen.has(r.id));
  return [...existing, ...additions];
}
