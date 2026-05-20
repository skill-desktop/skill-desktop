import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Optional action area rendered in the section header (e.g. a button). */
  actions?: React.ReactNode;
  /** Visual weight of the title. Defaults to `md`. */
  titleSize?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

/**
 * Vertical section with an optional title, description and inline actions.
 * Used by both `SettingsView` and `AIToolsView`; previously each view had its
 * own inline copy.
 */
export const Section: React.FC<SectionProps> = ({
  title,
  description,
  actions,
  titleSize = "md",
  className,
  children,
  ...rest
}) => {
  const titleClass =
    titleSize === "lg"
      ? "text-lg font-semibold text-text-primary"
      : titleSize === "sm"
      ? "text-xs font-medium uppercase tracking-wide text-text-muted"
      : "text-sm font-medium text-text-primary";

  const hasHeader = title || description || actions;

  return (
    <section className={cn("space-y-3", className)} {...rest}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {title && <h3 className={titleClass}>{title}</h3>}
            {description && (
              <p className="mt-1 text-xs text-text-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
};

Section.displayName = "Section";

interface SettingRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** When true, stacks the control below the label (useful for wide inputs). */
  stacked?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Row inside a `Section` for a single setting: label + description on the
 * left, control on the right. Used by SettingsView and consistent vertical
 * rhythm replicated from the old inline `SettingRow`.
 */
export const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  stacked = false,
  children,
  className,
}) => {
  if (stacked) {
    return (
      <div
        className={cn(
          "flex flex-col gap-2 border-b border-border-muted py-3 last:border-b-0",
          className
        )}
      >
        <div>
          <p className="text-sm font-medium text-text-primary">{label}</p>
          {description && (
            <p className="mt-1 text-xs text-text-muted">{description}</p>
          )}
        </div>
        <div>{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-border-muted py-3 last:border-b-0",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description && (
          <p className="mt-1 text-xs text-text-muted">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
};

SettingRow.displayName = "SettingRow";
