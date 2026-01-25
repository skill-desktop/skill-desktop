import React from "react";
import { cn } from "@/lib/utils";

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export const TabButton: React.FC<TabButtonProps> = ({ active, onClick, children }) => (
  <button
    className={cn(
      "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
      active
        ? "bg-bg-tertiary text-text-primary"
        : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary/50"
    )}
    onClick={onClick}
  >
    {children}
  </button>
);
