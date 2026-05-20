import * as React from "react";
import { cn } from "@/lib/utils";

interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Children are rendered side-by-side and visually segmented. */
  children: React.ReactNode;
}

/**
 * Segmented control wrapper. Use it for small clusters of related buttons —
 * the wrapper draws a single rounded border around the group and the
 * children are responsible for their own active state.
 *
 * Typical pattern:
 *
 *   <ButtonGroup>
 *     <Button variant="ghost" size="sm">A</Button>
 *     <Button variant="ghost" size="sm">B</Button>
 *   </ButtonGroup>
 *
 * The wrapper deliberately doesn't try to merge button radii (Tailwind's
 * `[&>*:first-child]` selectors handle that); callers can still pass through
 * any custom className.
 */
export const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center overflow-hidden rounded-md border border-border-default",
        // Children: square off internal corners, only first/last keep rounding.
        "[&>*]:rounded-none [&>*]:border-0",
        "[&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md",
        // Separator between siblings.
        "[&>*+*]:border-l [&>*+*]:border-border-default",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
ButtonGroup.displayName = "ButtonGroup";
