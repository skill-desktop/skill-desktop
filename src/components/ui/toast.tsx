import * as React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { create } from "zustand";
import { cn } from "@/lib/utils";

// ========== Types ==========

export type ToastTone = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  /** Auto-dismiss after this many ms. 0 = never. */
  durationMs: number;
}

interface ToastStore {
  items: Toast[];
  push: (t: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
}

// ========== Store ==========

let nextId = 1;
const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (t) => {
    const id = nextId++;
    set((state) => ({ items: [...state.items, { ...t, id }] }));
    return id;
  },
  dismiss: (id) =>
    set((state) => ({ items: state.items.filter((x) => x.id !== id) })),
}));

// ========== Imperative API ==========

/**
 * Imperative toast helper. Designed to be called from anywhere — including
 * outside React (mutation onSuccess / onError handlers commonly need it).
 *
 *   toast.success("Imported 3 skills");
 *   toast.error("Install failed", "Permission denied at ~/.claude/skills");
 *
 * Returns the toast id so callers can dismiss it programmatically when the
 * action they reported on gets undone.
 */
export const toast = {
  success: (title: string, description?: string, durationMs = 3500) =>
    useToastStore.getState().push({ title, description, tone: "success", durationMs }),
  error: (title: string, description?: string, durationMs = 6000) =>
    useToastStore.getState().push({ title, description, tone: "error", durationMs }),
  warning: (title: string, description?: string, durationMs = 4500) =>
    useToastStore.getState().push({ title, description, tone: "warning", durationMs }),
  info: (title: string, description?: string, durationMs = 3500) =>
    useToastStore.getState().push({ title, description, tone: "info", durationMs }),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};

// ========== Component ==========

/**
 * `<Toaster />` — mount once at the App root. Renders the active toast list
 * in a fixed bottom-right stack. Each toast auto-dismisses after its
 * `durationMs`; the user can also click the × to dismiss early.
 */
export const Toaster: React.FC = () => {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  React.useEffect(() => {
    if (toast.durationMs <= 0) return;
    const id = window.setTimeout(onDismiss, toast.durationMs);
    return () => window.clearTimeout(id);
  }, [toast.durationMs, onDismiss]);

  const palette = (() => {
    switch (toast.tone) {
      case "success":
        return {
          icon: <CheckCircle2 className="h-4 w-4" />,
          ring: "ring-accent-green/40",
          chip: "bg-accent-green/15 text-accent-green",
        };
      case "error":
        return {
          icon: <XCircle className="h-4 w-4" />,
          ring: "ring-accent-red/40",
          chip: "bg-accent-red/15 text-accent-red",
        };
      case "warning":
        return {
          icon: <AlertTriangle className="h-4 w-4" />,
          ring: "ring-accent-yellow/40",
          chip: "bg-accent-yellow/15 text-accent-yellow",
        };
      case "info":
        return {
          icon: <Info className="h-4 w-4" />,
          ring: "ring-accent-blue/40",
          chip: "bg-accent-blue/15 text-accent-blue",
        };
    }
  })();

  // Errors/warnings get the more attention-demanding live region. Successes
  // and info just announce politely so they don't interrupt a screen reader
  // user mid-sentence.
  const ariaLive = toast.tone === "error" ? "assertive" : "polite";
  const ariaRole = toast.tone === "error" ? "alert" : "status";

  return (
    <div
      role={ariaRole}
      aria-live={ariaLive}
      aria-atomic="true"
      className={cn(
        // Spring entry — overshoots from the right side of the screen and
        // settles. Keyframe lives in index.css next to the reduced-motion
        // fallback. We also keep ring-1 so each toast has a tone-tinted
        // halo even after the entrance animation completes.
        "pointer-events-auto flex items-start gap-3 rounded-xl border border-border-default bg-bg-secondary p-3 shadow-lg ring-1",
        "animate-spring-in-right",
        palette.ring
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          palette.chip
        )}
        aria-hidden="true"
      >
        {palette.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text-primary">
          {toast.title}
        </div>
        {toast.description && (
          <div className="mt-0.5 text-xs text-text-secondary">
            {toast.description}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};

Toaster.displayName = "Toaster";
