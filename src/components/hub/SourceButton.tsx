import React from "react";

interface SourceButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

export const SourceButton: React.FC<SourceButtonProps> = ({
  icon,
  label,
  description,
  selected,
  onClick,
}) => (
  <button
    className={`flex flex-col items-center justify-center rounded-lg border p-3 transition-colors ${
      selected
        ? "border-accent-blue bg-accent-blue/10"
        : "border-border-default hover:border-border-default/80 hover:bg-bg-tertiary"
    }`}
    onClick={onClick}
  >
    <div className={selected ? "text-accent-blue" : "text-text-muted"}>
      {icon}
    </div>
    <span
      className={`text-xs font-medium mt-1 ${
        selected ? "text-accent-blue" : "text-text-primary"
      }`}
    >
      {label}
    </span>
    <span className="text-[10px] text-text-muted">{description}</span>
  </button>
);
