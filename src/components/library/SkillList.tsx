import React from "react";
import { useSettingsStore } from "@/stores";
import { ScrollArea } from "@/components/ui";
import { SkillCard } from "./SkillCard";
import { SkillListItem } from "./SkillListItem";
import type { Skill } from "@/types";

interface SkillListProps {
  skills: Skill[];
  visibilityMap?: Record<string, boolean>;
  onVisibilityChange?: (skillHash: string, visible: boolean) => void;
}

export const SkillList: React.FC<SkillListProps> = ({
  skills,
  visibilityMap,
  onVisibilityChange,
}) => {
  const { viewMode } = useSettingsStore();

  if (skills.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        <div className="text-4xl mb-4">📭</div>
        <p className="text-sm">No skills found</p>
        <p className="text-xs mt-1">Import or create a skill to get started</p>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <ScrollArea className="h-full p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {skills.map((skill) => (
            <SkillCard
              key={skill.hash}
              skill={skill}
              isVisible={visibilityMap?.[skill.hash] ?? true}
              onVisibilityChange={
                onVisibilityChange
                  ? (visible) => onVisibilityChange(skill.hash, visible)
                  : undefined
              }
            />
          ))}
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="divide-y divide-border-muted">
        {skills.map((skill) => (
          <SkillListItem
            key={skill.hash}
            skill={skill}
            isVisible={visibilityMap?.[skill.hash] ?? true}
            onVisibilityChange={
              onVisibilityChange
                ? (visible) => onVisibilityChange(skill.hash, visible)
                : undefined
            }
          />
        ))}
      </div>
    </ScrollArea>
  );
};
