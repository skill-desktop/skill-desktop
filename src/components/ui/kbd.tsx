import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Keyboard shortcut hint, e.g. ⌘K / ⌘1 / Esc.
 *
 * Style replicates the chip in the search bar and search results so all
 * keyboard hints look identical regardless of where they appear.
 */
export const Kbd = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, children, ...props }, ref) => (
  <kbd
    ref={ref}
    className={cn(
      "pointer-events-none inline-flex h-[18px] select-none items-center justify-center rounded border border-border-default bg-bg-tertiary px-1.5 font-mono text-[10px] font-medium text-text-muted",
      className
    )}
    {...props}
  >
    {children}
  </kbd>
));
Kbd.displayName = "Kbd";
