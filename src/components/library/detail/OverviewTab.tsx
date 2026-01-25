import React from "react";
import { useTranslation } from "react-i18next";
import { FolderTree, File, Folder, FolderOpen, ChevronRight, ChevronDown, BookOpen, Tag } from "lucide-react";
import { Badge, Markdown } from "@/components/ui";
import type { Skill, SkillResource } from "@/types";
import { Section } from "./Section";

interface OverviewTabProps {
  skill: Skill;
  onOpenFile?: (filePath: string) => void;
}

// File tree node type
interface TreeNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: TreeNode[];
  resource?: SkillResource;
}

// Build tree structure from skill resources
function buildFileTree(skill: Skill): TreeNode[] {
  const tree: TreeNode[] = [];
  
  // Add SKILL.md as root file
  tree.push({
    name: "SKILL.md",
    type: "file",
    path: "SKILL.md",
  });
  
  // Add scripts folder if has scripts
  if (skill.resources.scripts.length > 0) {
    tree.push({
      name: "scripts",
      type: "folder",
      path: "scripts",
      children: skill.resources.scripts.map(r => ({
        name: r.name,
        type: "file" as const,
        path: r.path,
        resource: r,
      })),
    });
  }
  
  // Add references folder if has references
  if (skill.resources.references.length > 0) {
    tree.push({
      name: "references",
      type: "folder",
      path: "references",
      children: skill.resources.references.map(r => ({
        name: r.name,
        type: "file" as const,
        path: r.path,
        resource: r,
      })),
    });
  }
  
  // Add assets folder if has assets
  if (skill.resources.assets.length > 0) {
    tree.push({
      name: "assets",
      type: "folder",
      path: "assets",
      children: skill.resources.assets.map(r => ({
        name: r.name,
        type: "file" as const,
        path: r.path,
        resource: r,
      })),
    });
  }
  
  // Add other files at root level
  skill.resources.other.forEach(r => {
    tree.push({
      name: r.name,
      type: "file",
      path: r.path,
      resource: r,
    });
  });
  
  return tree;
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Tree node component
const TreeNodeItem: React.FC<{
  node: TreeNode;
  level: number;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  skillDir: string;
  onOpenFile?: (filePath: string) => void;
}> = ({ node, level, expandedFolders, onToggleFolder, skillDir, onOpenFile }) => {
  const isExpanded = expandedFolders.has(node.path);
  const paddingLeft = level * 16;
  
  if (node.type === "folder") {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(node.path)}
          className="flex w-full items-center gap-1.5 py-1 px-2 text-xs hover:bg-bg-elevated rounded transition-colors"
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-text-muted shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-text-muted shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className="h-3.5 w-3.5 text-accent-yellow shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-accent-yellow shrink-0" />
          )}
          <span className="text-text-primary truncate">{node.name}</span>
          <span className="text-text-muted ml-auto">
            {node.children?.length || 0}
          </span>
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNodeItem
                key={child.path}
                node={child}
                level={level + 1}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                skillDir={skillDir}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
  
  // File node - clickable to open editor
  const handleClick = () => {
    if (onOpenFile) {
      // Build full path: skillDir + node.path
      const fullPath = `${skillDir}/${node.path}`;
      onOpenFile(fullPath);
    }
  };
  
  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center gap-1.5 py-1 px-2 text-xs hover:bg-accent-blue/10 hover:text-accent-blue rounded transition-colors cursor-pointer"
      style={{ paddingLeft: paddingLeft + 16 }}
    >
      <File className="h-3.5 w-3.5 text-text-muted shrink-0" />
      <span className="truncate flex-1 text-left">{node.name}</span>
      {node.resource && (
        <span className="text-text-muted text-[10px]">
          {formatFileSize(node.resource.size)}
        </span>
      )}
    </button>
  );
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ skill, onOpenFile }) => {
  const { t } = useTranslation();
  
  // Build file tree
  const fileTree = React.useMemo(() => buildFileTree(skill), [skill]);
  
  // Track expanded folders - default expand all
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(() => {
    const expanded = new Set<string>();
    fileTree.forEach(node => {
      if (node.type === "folder") {
        expanded.add(node.path);
      }
    });
    return expanded;
  });
  
  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };
  
  // Count total files
  const totalFiles = React.useMemo(() => {
    let count = 1; // SKILL.md
    count += skill.resources.scripts.length;
    count += skill.resources.references.length;
    count += skill.resources.assets.length;
    count += skill.resources.other.length;
    return count;
  }, [skill.resources]);

  return (
    <>
      {/* File Tree */}
      <Section 
        title={t("skillDetail.fileTree")} 
        icon={<FolderTree className="h-3.5 w-3.5" />}
      >
        <div className="text-xs text-text-muted mb-2">
          {skill.name}/ • {totalFiles} {t("skillDetail.files")}
        </div>
        <div className="rounded-md border border-border-muted bg-bg-tertiary p-2 -mx-1">
          {fileTree.map((node) => (
            <TreeNodeItem
              key={node.path}
              node={node}
              level={0}
              expandedFolders={expandedFolders}
              onToggleFolder={toggleFolder}
              skillDir={skill.skillDir}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      </Section>

      {/* Description */}
      <Section title={t("skillDetail.description")} icon={<BookOpen className="h-3.5 w-3.5" />}>
        <Markdown 
          content={skill.description || t("skillDetail.noDescription")} 
          className="text-xs text-text-secondary"
        />
      </Section>

      {/* Tags */}
      {skill.tags.length > 0 && (
        <Section title={t("skillDetail.tags")} icon={<Tag className="h-3.5 w-3.5" />}>
          <div className="flex flex-wrap gap-1">
            {skill.tags.map((tag) => (
              <Badge key={tag} variant="blue" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </Section>
      )}
    </>
  );
};
