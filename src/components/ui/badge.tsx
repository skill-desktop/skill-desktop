import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-bg-tertiary text-text-primary",
        secondary: "bg-bg-elevated text-text-secondary",
        low: "bg-permission-low/15 text-permission-low border border-permission-low/50",
        medium: "bg-permission-medium/15 text-permission-medium border border-permission-medium/50",
        high: "bg-permission-high/15 text-permission-high border border-permission-high/50",
        blue: "bg-accent-blue/15 text-accent-blue border border-accent-blue/50",
        green: "bg-accent-green/15 text-accent-green border border-accent-green/50",
        purple: "bg-accent-purple/15 text-accent-purple border border-accent-purple/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
