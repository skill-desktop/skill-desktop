import * as React from "react";
import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "error";

const toneStyles: Record<Tone, { container: string; icon: React.ReactNode }> = {
  info: {
    container: "border-accent-blue/40 bg-accent-blue/10 text-accent-blue",
    icon: <Info className="h-3.5 w-3.5" />,
  },
  success: {
    container: "border-accent-green/40 bg-accent-green/10 text-accent-green",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  warning: {
    container: "border-accent-yellow/40 bg-accent-yellow/10 text-accent-yellow",
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
  error: {
    container: "border-accent-red/40 bg-accent-red/10 text-accent-red",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
};

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  /** Override the default icon for the tone (or pass `null` to remove). */
  icon?: React.ReactNode | null;
  /** Optional inline action (e.g. a small "Dismiss" / "Retry" button). */
  action?: React.ReactNode;
}

/**
 * Compact inline alert / status strip used for transient feedback like
 * "synced 3 skills", "failed to load", "needs setup", etc.
 *
 * Visually tuned to slot into existing forms and detail panels without
 * breaking the surface palette; the bordered tinted style matches the
 * existing SpaceDetail sync message it replaces.
 */
const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, tone = "info", icon, action, children, ...props }, ref) => {
    const palette = toneStyles[tone];
    const resolvedIcon = icon === undefined ? palette.icon : icon;

    return (
      <div
        ref={ref}
        role="status"
        className={cn(
          "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
          palette.container,
          className
        )}
        {...props}
      >
        {resolvedIcon && (
          <span className="mt-0.5 shrink-0 leading-none">{resolvedIcon}</span>
        )}
        <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    );
  }
);
Alert.displayName = "Alert";

export { Alert };
