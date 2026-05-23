import * as React from "react";
import { cn } from "@/lib/utils";

interface ContextMenuProps {
  children: React.ReactNode;
}

interface ContextMenuTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

interface ContextMenuContentProps {
  children: React.ReactNode;
  className?: string;
}

interface ContextMenuItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  className?: string;
}

interface ContextMenuSeparatorProps {
  className?: string;
}

const ContextMenuContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  position: { x: number; y: number };
  setPosition: (position: { x: number; y: number }) => void;
}>({
  open: false,
  setOpen: () => {},
  position: { x: 0, y: 0 },
  setPosition: () => {},
});

export const ContextMenu: React.FC<ContextMenuProps> = ({ children }) => {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });

  return (
    <ContextMenuContext.Provider value={{ open, setOpen, position, setPosition }}>
      {children}
    </ContextMenuContext.Provider>
  );
};

export const ContextMenuTrigger: React.FC<ContextMenuTriggerProps> = ({
  children,
  asChild,
}) => {
  const { setOpen, setPosition } = React.useContext(ContextMenuContext);

  // Stop propagation so a nested ContextMenu (e.g. a SkillCard inside a list
  // that also wraps in ContextMenu) doesn't ALSO fire the parent's handler.
  // Without this, both menus would open at the same coords and the visible
  // one would jitter / appear in the wrong place depending on z-index.
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX, y: e.clientY });
    setOpen(true);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onContextMenu?: (e: React.MouseEvent) => void }>, {
      onContextMenu: handleContextMenu,
    });
  }

  return <div onContextMenu={handleContextMenu}>{children}</div>;
};

export const ContextMenuContent: React.FC<ContextMenuContentProps> = ({
  children,
  className,
}) => {
  const { open, setOpen, position } = React.useContext(ContextMenuContext);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu when clicking outside / scrolling / pressing Esc.
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    // Scrolling underneath the menu invalidates its anchor (the right-click
    // location moves with the content), so closing is safer than letting the
    // menu float over the now-wrong row.
    const handleScroll = () => setOpen(false);

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", handleScroll, true);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll, true);
    };
  }, [open, setOpen]);

  // Compute final position synchronously before paint so the menu never
  // flashes at (0,0) or yesterday's position on first render. We start with
  // the raw click coordinates (correct ~99% of the time) and use
  // useLayoutEffect to clamp into the viewport once the menu has measured
  // itself; the clamp runs before the browser paints the next frame.
  const [adjustedPosition, setAdjustedPosition] = React.useState(position);

  React.useLayoutEffect(() => {
    if (!open) return;
    // Reset to raw click coordinates on every open so a stale clamped value
    // from a previous open (different anchor, different scroll) isn't reused.
    setAdjustedPosition(position);
  }, [open, position]);

  React.useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const PADDING = 8;

    let x = position.x;
    let y = position.y;

    // Flip horizontal: prefer keeping the click as the menu's left edge,
    // but slide left when we'd overflow the viewport.
    if (x + rect.width + PADDING > viewportWidth) {
      x = Math.max(PADDING, viewportWidth - rect.width - PADDING);
    }
    // Flip vertical: same idea, slide up if needed.
    if (y + rect.height + PADDING > viewportHeight) {
      y = Math.max(PADDING, viewportHeight - rect.height - PADDING);
    }

    if (x !== adjustedPosition.x || y !== adjustedPosition.y) {
      setAdjustedPosition({ x, y });
    }
    // We deliberately don't depend on `adjustedPosition` to avoid feedback
    // loops; the comparison above already short-circuits no-op writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, position]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        "fixed z-50 min-w-[180px] rounded-md border border-border-default bg-bg-elevated p-1 shadow-lg animate-in fade-in-0 zoom-in-95",
        className
      )}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {children}
    </div>
  );
};

export const ContextMenuItem: React.FC<ContextMenuItemProps> = ({
  children,
  onClick,
  disabled = false,
  destructive = false,
  className,
}) => {
  const { setOpen } = React.useContext(ContextMenuContext);

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
      setOpen(false);
    }
  };

  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
        disabled
          ? "cursor-not-allowed opacity-50"
          : destructive
          ? "text-accent-red hover:bg-accent-red/10"
          : "text-text-primary hover:bg-bg-tertiary",
        className
      )}
      onClick={handleClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export const ContextMenuSeparator: React.FC<ContextMenuSeparatorProps> = ({
  className,
}) => {
  return (
    <div className={cn("my-1 h-px bg-border-muted", className)} />
  );
};
