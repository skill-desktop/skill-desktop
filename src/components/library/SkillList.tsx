import React from "react";
import { useTranslation } from "react-i18next";
import { CheckSquare, ChevronDown, ChevronRight, Folder, FolderPlus } from "lucide-react";
import { useSettingsStore } from "@/stores";
import { ScrollArea, Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator } from "@/components/ui";
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
  // Category props
  onMoveToCategory?: (skillHash: string, category: string) => void;
  onAddCategory?: (skillHash?: string) => void;
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
  onMoveToCategory,
  onAddCategory,
}) => {
  const { t } = useTranslation();
  const { viewMode } = useSettingsStore();
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set(["default"]));

  // Group skills by category
  const groupedSkills = React.useMemo(() => {
    const groups: Record<string, Skill[]> = {};
    const defaultCategory = "default"; // Internal key for uncategorized
    
    // Initialize default category
    groups[defaultCategory] = [];

    skills.forEach(skill => {
      const category = skill.category || defaultCategory;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(skill);
    });

    // Sort categories (default first, then alphabetical)
    const sortedCategories = Object.keys(groups).sort((a, b) => {
      if (a === defaultCategory) return -1;
      if (b === defaultCategory) return 1;
      return a.localeCompare(b);
    });

    return sortedCategories.map(category => ({
      id: category,
      name: category === defaultCategory ? t("library.category.default") : category,
      skills: groups[category],
    }));
  }, [skills, t]);

  // Toggle category expansion
  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  // Ensure categories with matching search results are expanded
  React.useEffect(() => {
    if (skills.length < 50) { // Auto expand if few skills
        const allCategories = groupedSkills.map(g => g.id);
        setExpandedCategories(new Set(allCategories));
    }
  }, [skills.length, groupedSkills.length]);


  if (skills.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        <div className="text-4xl mb-4">📭</div>
        <p className="text-sm">{t("common.noData")}</p>
      </div>
    );
  }

  const renderSkill = (skill: Skill) => {
    const content = viewMode === "grid" ? (
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
    ) : (
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
    );

    // Wrap with Context Menu for Move to Category
    if (onMoveToCategory) {
      return (
        <ContextMenu key={skill.hash}>
          <ContextMenuTrigger>
            {content}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem disabled className="text-xs font-semibold text-text-muted">
               {t("library.moveToCategory")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            {groupedSkills.map(group => (
              <ContextMenuItem
                key={group.id}
                onClick={() => onMoveToCategory(skill.hash, group.id === "default" ? "" : group.id)} // Empty string removes category
                className={skill.category === (group.id === "default" ? undefined : group.id) ? "bg-accent/50" : ""}
              >
                {group.id === "default" ? <Folder className="w-4 h-4 mr-2" /> : <Folder className="w-4 h-4 mr-2" />}
                {group.name}
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onAddCategory?.(skill.hash)}>
              <FolderPlus className="w-4 h-4 mr-2" />
              {t("library.newCategory")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
    }

    return content;
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Selection mode toggle */}
        {onEnterSelectionMode && !selectionMode && skills.length > 0 && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={onEnterSelectionMode}>
              <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
              {t("common.selectAll")}
            </Button>
          </div>
        )}

        {groupedSkills.map((group) => {
            if (group.skills.length === 0) return null;

            return (
              <div key={group.id} className="space-y-2">
                <div 
                  className="flex items-center gap-2 cursor-pointer hover:text-text-primary text-text-secondary select-none"
                  onClick={() => toggleCategory(group.id)}
                >
                  {expandedCategories.has(group.id) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <h3 className="text-sm font-semibold">{group.name}</h3>
                  <span className="text-xs text-text-muted">({group.skills.length})</span>
                </div>

                {expandedCategories.has(group.id) && (
                  <div className={viewMode === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 pl-2" : "space-y-1 pl-2"}>
                    {group.skills.map(renderSkill)}
                  </div>
                )}
              </div>
            );
        })}
      </div>
    </ScrollArea>
  );
};
