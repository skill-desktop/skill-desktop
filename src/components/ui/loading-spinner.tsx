import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const sizeClass: Record<Size, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

interface LoadingSpinnerProps {
  /** Visual size of the spinner. Defaults to `md`. */
  size?: Size;
  /** Optional label rendered beside the spinner. */
  label?: React.ReactNode;
  /** If true, fills the parent and centers; otherwise renders inline. */
  fullHeight?: boolean;
  className?: string;
}

/**
 * Centered loading indicator. Two usage modes:
 *
 * 1. `fullHeight` — fills the container and vertically centers (replaces the
 *    inline "h-full items-center justify-center" pattern that was duplicated
 *    in `SpacesView`, `AIToolsView`, etc.).
 * 2. inline — just a spinner + optional label.
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "md",
  label,
  fullHeight = false,
  className,
}) => {
  const spinner = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Loader2 className={cn("animate-spin text-text-muted", sizeClass[size])} />
      {label && <span className="text-sm text-text-muted">{label}</span>}
    </span>
  );

  if (!fullHeight) return spinner;

  return (
    <div className="flex h-full w-full items-center justify-center py-12">
      {spinner}
    </div>
  );
};

LoadingSpinner.displayName = "LoadingSpinner";
