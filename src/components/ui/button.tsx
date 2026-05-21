import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-accent-blue text-white hover:bg-accent-blue/90",
        destructive:
          "bg-accent-red text-white hover:bg-accent-red/90",
        outline:
          "border border-border-default bg-transparent hover:bg-bg-tertiary",
        secondary:
          "bg-bg-tertiary text-text-primary hover:bg-bg-elevated",
        ghost: "hover:bg-bg-tertiary",
        link: "text-accent-blue underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    // Dev-time a11y check — flag icon-only buttons that ship no accessible
    // name. We only warn (don't throw) so the UI stays functional. Disabled
    // in production builds because import.meta.env.DEV is true only in vite
    // dev mode. The check is opt-out via passing aria-hidden or title.
    if (import.meta.env?.DEV && size === "icon") {
      const hasAriaLabel = !!props["aria-label"];
      const hasAriaLabelledby = !!props["aria-labelledby"];
      const hasTitle = !!props.title;
      if (!hasAriaLabel && !hasAriaLabelledby && !hasTitle) {
        // Don't spam — single warn per render is acceptable. Real fix is for
        // the caller to add `aria-label="..."`.
        // eslint-disable-next-line no-console
        console.warn(
          "[a11y] icon-only <Button /> rendered without aria-label / aria-labelledby / title."
        );
      }
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
