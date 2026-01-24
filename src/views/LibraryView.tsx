import React from "react";
import { useAppStore, useSettingsStore } from "@/stores";
import { useSkills, useSearchSkills } from "@/hooks";
import { SkillList, SkillDetail } from "@/components/library";
import { Skeleton } from "@/components/ui";
import type { Skill } from "@/types";

export const LibraryView: React.FC = () => {
  const { searchQuery, selectedSkillHash } = useAppStore();
  const { libraryPath } = useSettingsStore();

  // Fetch skills from backend
  const { data: allSkills = [], isLoading, error } = useSkills();

  // Search skills if there's a query
  const { data: searchResults } = useSearchSkills(searchQuery);

  // Use search results if searching, otherwise use all skills
  const skills = searchQuery ? (searchResults || []) : allSkills;

  // Find selected skill
  const selectedSkill = React.useMemo(() => {
    if (!selectedSkillHash) return null;
    return allSkills.find((s: Skill) => s.hash === selectedSkillHash) || null;
  }, [selectedSkillHash, allSkills]);

  // Show empty state if no library path is set
  if (!libraryPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        <div className="text-4xl mb-4">📁</div>
        <p className="text-sm">No library directory set</p>
        <p className="text-xs mt-1">Go to Settings to configure your library path</p>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-full">
        <div className="flex-1 p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-sm">Failed to load skills</p>
        <p className="text-xs mt-1">{String(error)}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Skill list */}
      <div className="flex-1 overflow-hidden">
        <SkillList skills={skills} />
      </div>

      {/* Detail panel */}
      <SkillDetail skill={selectedSkill} />
    </div>
  );
};
