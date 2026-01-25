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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
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

  // Close menu when clicking outside
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

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, setOpen]);

  // Adjust position to stay within viewport
  const [adjustedPosition, setAdjustedPosition] = React.useState(position);

  React.useEffect(() => {
    if (open && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      // Adjust horizontal position
      if (x + rect.width > viewportWidth) {
        x = viewportWidth - rect.width - 8;
      }

      // Adjust vertical position
      if (y + rect.height > viewportHeight) {
        y = viewportHeight - rect.height - 8;
      }

      setAdjustedPosition({ x, y });
    }
  }, [open, position]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
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
