import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Empty / placeholder state. Used in three flavours throughout the app:
 *
 *  - `default`: big circular icon, title, description, optional CTA
 *    (used on first-launch screens like "no library path", "no skills yet").
 *  - `compact`: a short centered message (used inside side panels when
 *    no row is selected).
 *  - `error`: same shape as default but uses the danger palette.
 *
 * The component intentionally avoids a hard layout commitment so callers can
 * drop it into `flex h-full` containers (which is how every view uses it).
 */

type Variant = "default" | "compact" | "error";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: Variant;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  variant = "default",
  className,
}) => {
  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex flex-1 items-center justify-center px-4 py-6 text-sm text-text-muted",
          className
        )}
      >
        {title ?? description}
      </div>
    );
  }

  const isError = variant === "error";

  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center px-8 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            "mb-6 flex h-20 w-20 items-center justify-center rounded-full",
            isError ? "bg-accent-red/10 text-accent-red" : "bg-bg-tertiary text-text-muted"
          )}
        >
          {icon}
        </div>
      )}
      {title && (
        <h3
          className={cn(
            "mb-2 text-lg font-medium",
            isError ? "text-accent-red" : "text-text-primary"
          )}
        >
          {title}
        </h3>
      )}
      {description && (
        <p className="mb-6 max-w-sm text-sm text-text-muted">{description}</p>
      )}
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
};

EmptyState.displayName = "EmptyState";
