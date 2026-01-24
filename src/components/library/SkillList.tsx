import React from "react";
import { CheckSquare } from "lucide-react";
import { useSettingsStore } from "@/stores";
import { ScrollArea, Button } from "@/components/ui";
import { SkillCard } from "./SkillCard";
import { SkillListItem } from "./SkillListItem";
import type { Skill } from "@/types";

interface SkillListProps {
  skills: Skill[];
  visibilityMap?: Record<string, boolean>;
  onVisibilityChange?: (skillHash: string, visible: boolean) => void;
  // Selection mode props
  selectionMode?: boolean;
  selectedHashes?: Set<string>;
  onToggleSelection?: (hash: string) => void;
  onEnterSelectionMode?: () => void;
  // Quarantine props
  quarantinedHashes?: Set<string>;
}

export const SkillList: React.FC<SkillListProps> = ({
  skills,
  visibilityMap,
  onVisibilityChange,
  selectionMode = false,
  selectedHashes = new Set(),
  onToggleSelection,
  onEnterSelectionMode,
  quarantinedHashes = new Set(),
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
        {/* Selection mode toggle */}
        {onEnterSelectionMode && !selectionMode && skills.length > 0 && (
          <div className="mb-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={onEnterSelectionMode}>
              <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
              Select
            </Button>
          </div>
        )}
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
              selectionMode={selectionMode}
              isSelected={selectedHashes.has(skill.hash)}
              onToggleSelection={onToggleSelection}
              isQuarantined={quarantinedHashes.has(skill.hash)}
            />
          ))}
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full">
      {/* Selection mode toggle */}
      {onEnterSelectionMode && !selectionMode && skills.length > 0 && (
        <div className="px-4 py-2 flex justify-end border-b border-border-muted">
          <Button variant="ghost" size="sm" onClick={onEnterSelectionMode}>
            <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
            Select
          </Button>
        </div>
      )}
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
            selectionMode={selectionMode}
            isSelected={selectedHashes.has(skill.hash)}
            onToggleSelection={onToggleSelection}
            isQuarantined={quarantinedHashes.has(skill.hash)}
          />
        ))}
      </div>
    </ScrollArea>
  );
};
