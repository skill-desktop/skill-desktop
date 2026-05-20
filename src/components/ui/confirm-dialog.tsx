import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";
import { Button } from "./button";

type Tone = "default" | "danger" | "warning";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Body content rendered between description and footer (optional). */
  children?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  confirmIcon?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  /** Confirm-button colour. `danger` for destructive ops. */
  tone?: Tone;
  /** Disables the confirm button while the action is in flight. */
  isPending?: boolean;
  /** Disables the confirm button when the form / selection is invalid. */
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Reusable confirm/cancel dialog. Replaces the ~5 hand-rolled copies of this
 * pattern in `LibraryView`, `DeleteSpaceDialog`, etc.
 *
 * Keep it intentionally thin: callers that need richer bodies (e.g. an
 * export-format picker) pass `children` between the description and the
 * footer.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  confirmIcon,
  cancelLabel,
  tone = "default",
  isPending = false,
  disabled = false,
  onConfirm,
}) => {
  const buttonVariant =
    tone === "danger" ? "destructive" : tone === "warning" ? "default" : "default";

  const handleConfirm = async () => {
    if (isPending || disabled) return;
    await onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children && <div className="py-2">{children}</div>}
        <DialogFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={buttonVariant}
            size="sm"
            onClick={handleConfirm}
            disabled={isPending || disabled}
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              confirmIcon && <span className="mr-1.5 inline-flex">{confirmIcon}</span>
            )}
            {confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

ConfirmDialog.displayName = "ConfirmDialog";
