import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Check, Plus, FolderTree, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores";
import { useSpaces } from "@/hooks";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui";

interface WorkspaceSwitcherProps {
  /**
   * Called when the user wants to create a new workspace. Optional — when
   * absent we hide the "+ New" entry. LibraryView passes the same callback
   * the SpacesView uses internally.
   */
  onNewWorkspace?: () => void;
  /** Called when the user wants to manage workspaces (jumps to SpacesView). */
  onManageWorkspaces?: () => void;
  className?: string;
}

/**
 * Tiny dropdown above the skill grid that lets the user switch between
 * workspaces without leaving the Library view. M2-2: replaces the dedicated
 * Spaces top-level Tab so the IA shrinks from 5 to 3 entries.
 *
 * - Reads `spaces` + `currentSpaceId` from existing hooks.
 * - "Default Workspace" maps to the special `default` space.
 * - Bottom of the dropdown links to the legacy SpacesView for power use.
 */
export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  onNewWorkspace,
  onManageWorkspaces,
  className,
}) => {
  const { t } = useTranslation();
  const { currentSpaceId, setCurrentSpaceId } = useAppStore();
  const { data: spaces = [] } = useSpaces();

  const currentSpace = React.useMemo(() => {
    if (!currentSpaceId) {
      return spaces.find((s) => s.isDefault) ?? spaces[0] ?? null;
    }
    return spaces.find((s) => s.id === currentSpaceId) ?? null;
  }, [currentSpaceId, spaces]);

  const label = currentSpace?.name ?? t("common.default", "Default");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 gap-1.5 rounded-lg border border-border-default bg-bg-secondary px-3",
            className
          )}
        >
          <FolderTree className="h-3.5 w-3.5 text-text-muted" />
          <span className="max-w-[160px] truncate text-sm font-medium text-text-primary">
            {label}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {spaces.map((space) => (
          <DropdownMenuItem
            key={space.id}
            onClick={() => setCurrentSpaceId(space.id)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{space.name}</span>
            {currentSpace?.id === space.id && (
              <Check className="h-3.5 w-3.5 text-accent-blue" />
            )}
          </DropdownMenuItem>
        ))}
        {(onNewWorkspace || onManageWorkspaces) && <DropdownMenuSeparator />}
        {onNewWorkspace && (
          <DropdownMenuItem onClick={onNewWorkspace}>
            <Plus className="h-3.5 w-3.5" />
            {t("workspaceSwitcher.newWorkspace", "New workspace")}
          </DropdownMenuItem>
        )}
        {onManageWorkspaces && (
          <DropdownMenuItem onClick={onManageWorkspaces}>
            <Settings className="h-3.5 w-3.5" />
            {t("workspaceSwitcher.manage", "Manage workspaces...")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
