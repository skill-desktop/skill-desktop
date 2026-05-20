import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** When true, renders with a monospace font (e.g. JSON / markdown editors). */
  mono?: boolean;
}

/**
 * Multi-line text input matched to `<Input>` so forms stay visually
 * consistent. Use `mono` for code/JSON content (e.g. parameter inputs in
 * `SandboxView`, the AI tools config editor).
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, mono = false, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        spellCheck={mono ? false : props.spellCheck}
        className={cn(
          "flex w-full rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm text-text-primary shadow-sm transition-colors placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue disabled:cursor-not-allowed disabled:opacity-50",
          mono && "bg-bg-tertiary font-mono",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
