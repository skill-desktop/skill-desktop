import * as React from "react";
import { cn } from "@/lib/utils";

interface DropdownMenuProps {
  children: React.ReactNode;
}

interface DropdownMenuTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

interface DropdownMenuContentProps {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}

interface DropdownMenuItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  className?: string;
}

interface DropdownMenuSeparatorProps {
  className?: string;
}

const DropdownMenuContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}>({
  open: false,
  setOpen: () => {},
  triggerRef: { current: null },
});

export const DropdownMenu: React.FC<DropdownMenuProps> = ({ children }) => {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement>(null);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative inline-block">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
};

export const DropdownMenuTrigger: React.FC<DropdownMenuTriggerProps> = ({
  children,
  asChild,
}) => {
  const { open, setOpen, triggerRef } = React.useContext(DropdownMenuContext);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(!open);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ 
      onClick?: (e: React.MouseEvent) => void;
      ref?: React.Ref<HTMLElement>;
    }>, {
      onClick: handleClick,
      ref: triggerRef as React.RefObject<HTMLElement>,
    });
  }

  return (
    <button 
      ref={triggerRef as React.RefObject<HTMLButtonElement>}
      onClick={handleClick}
    >
      {children}
    </button>
  );
};

export const DropdownMenuContent: React.FC<DropdownMenuContentProps> = ({
  children,
  className,
  align = "start",
}) => {
  const { open, setOpen, triggerRef } = React.useContext(DropdownMenuContext);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
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
  }, [open, setOpen, triggerRef]);

  if (!open) return null;

  const alignClass = {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  }[align];

  return (
    <div
      ref={menuRef}
      className={cn(
        "absolute z-50 mt-1 min-w-[140px] rounded-md border border-border-default bg-bg-elevated p-1 shadow-lg animate-in fade-in-0 zoom-in-95",
        alignClass,
        className
      )}
    >
      {children}
    </div>
  );
};

export const DropdownMenuItem: React.FC<DropdownMenuItemProps> = ({
  children,
  onClick,
  disabled = false,
  destructive = false,
  className,
}) => {
  const { setOpen } = React.useContext(DropdownMenuContext);

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

export const DropdownMenuSeparator: React.FC<DropdownMenuSeparatorProps> = ({
  className,
}) => {
  return (
    <div className={cn("my-1 h-px bg-border-muted", className)} />
  );
};
