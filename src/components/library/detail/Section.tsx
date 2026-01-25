import React from "react";

interface SectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, icon, children }) => (
  <div className="mb-4">
    <h3 className="flex items-center gap-1.5 text-xs font-medium text-text-muted mb-2">
      {icon}
      {title}
    </h3>
    {children}
  </div>
);
