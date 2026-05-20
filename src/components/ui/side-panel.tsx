import * as React from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "./scroll-area";

interface SidePanelProps {
  /** Title rendered in the panel header. */
  title?: React.ReactNode;
  /** Optional right-aligned actions in the panel header. */
  actions?: React.ReactNode;
  /** Body content; usually a list of `SideNavItem`. */
  children: React.ReactNode;
  /** Tailwind width class. Defaults to `w-72` which matches the existing views. */
  width?: string;
  className?: string;
}

/**
 * Left-rail panel used by the secondary views (Settings, AI Tools, Spaces,
 * Sandbox). Previously each view re-implemented this layout (border + header
 * + scrolling body) with subtle inconsistencies; this component centralises
 * the chrome so widths / borders / scrolling all behave the same.
 */
export const SidePanel: React.FC<SidePanelProps> = ({
  title,
  actions,
  children,
  width = "w-72",
  className,
}) => {
  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border-default bg-bg-secondary",
        width,
        className
      )}
    >
      {(title || actions) && (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-default px-3">
          {title && (
            <h2 className="text-sm font-medium text-text-primary">{title}</h2>
          )}
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
      )}
      <ScrollArea className="flex-1">{children}</ScrollArea>
    </aside>
  );
};

SidePanel.displayName = "SidePanel";

interface SideNavItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  /** Label shown after the icon. */
  label: React.ReactNode;
  /** Secondary line under the label (e.g. counts, descriptions). */
  meta?: React.ReactNode;
  /** Right-side accessory (icons, badges). */
  trailing?: React.ReactNode;
  active?: boolean;
  /** When true, paints a highlight ring to indicate a drag target. */
  dragOver?: boolean;
}

/**
 * Single row inside a `SidePanel`. Replaces the duplicated
 * "active = left-border-blue + bg-tertiary" snippet across views.
 */
export const SideNavItem = React.forwardRef<HTMLButtonElement, SideNavItemProps>(
  (
    { icon, label, meta, trailing, active, dragOver, className, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        {...props}
        className={cn(
          "flex w-full items-center gap-3 border-l-2 px-3 py-2 text-left text-sm transition-colors",
          active
            ? "border-accent-blue bg-bg-tertiary text-text-primary"
            : "border-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
          dragOver && "bg-accent-blue/15 ring-1 ring-inset ring-accent-blue/60",
          className
        )}
      >
        {icon && <span className="shrink-0 text-current">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{label}</span>
          {meta && (
            <span className="block truncate text-xs text-text-muted">{meta}</span>
          )}
        </span>
        {trailing && <span className="shrink-0">{trailing}</span>}
      </button>
    );
  }
);
SideNavItem.displayName = "SideNavItem";
