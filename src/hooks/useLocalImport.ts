import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Skill } from "@/types";
import { skillKeys } from "./useSkills";
import type { SkillPreview, ImportResult } from "./useImport";

// ========== Types ==========

/**
 * One skill we discovered in / inferred from a local source (folder, .zip,
 * .skill, or loose .md).
 *
 * Matches the Rust `LocalSkillCandidate` struct in
 * `src-tauri/src/scanner/local_import.rs`.
 */
export interface LocalSkillCandidate {
  /** The user-provided path (e.g. the .zip the user picked). */
  sourcePath: string;
  /** Source kind: `folder` | `zip` | `skill` | `markdown`. */
  sourceType: LocalSourceType;
  /** Absolute path to the SKILL.md inside the source (may live in a temp dir). */
  skillMdPath: string;
  /** Directory holding the SKILL.md (also possibly temp). */
  skillDir: string;
  /** Original `name` from front matter. */
  name: string;
  /** Sanitized name that will be used as the on-disk directory in the library. */
  safeName: string;
  /** Description from frontmatter (may be empty). */
  description: string;
  /** True iff this candidate has valid frontmatter and a usable safe name. */
  valid: boolean;
  /** When `valid` is false, why. */
  error?: string;
}

export type LocalSourceType = "folder" | "zip" | "skill" | "markdown";

// ========== Hooks ==========

/**
 * Preview a single local source — folder, .zip, .skill, or .md file. The backend
 * extracts archives to a temp dir, parses the first SKILL.md it finds, then
 * cleans up before returning.
 *
 * The returned `SkillPreview` is the same shape as URL / GitHub previews so the
 * existing `SkillPreviewPanel` can render it without changes.
 */
export function usePreviewLocalSkill() {
  return useMutation({
    mutationFn: async (path: string) => {
      return await invoke<SkillPreview>("preview_local_skill", { path });
    },
  });
}

/**
 * Import a single local source into the library. Resolves to the resulting
 * `Skill` record; rejects on collision (`Skipped: <name>`) or hard failure.
 */
export function useImportLocalSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (path: string) => {
      return await invoke<Skill>("import_local_skill", { path });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

/**
 * Batch import: accept many paths (mixed folders / archives / .md files) and
 * return an aggregated `ImportResult` with imported / skipped / errors counts.
 */
export function useImportLocalSkillsBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paths: string[]) => {
      return await invoke<ImportResult>("import_local_skills_batch", { paths });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

/**
 * Scan a folder for every nested skill candidate (any directory containing a
 * SKILL.md). Used by the "Scan Folder" entry point so the user can multi-select
 * which ones to actually import.
 */
export function useScanDirectoryForSkills() {
  return useMutation({
    mutationFn: async (path: string) => {
      return await invoke<LocalSkillCandidate[]>("scan_directory_for_skills", {
        path,
      });
    },
  });
}
