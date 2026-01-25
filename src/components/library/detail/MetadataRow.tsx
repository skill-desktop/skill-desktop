import React from "react";

interface MetadataRowProps {
  label: string;
  value: string;
}

export const MetadataRow: React.FC<MetadataRowProps> = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-text-muted">{label}</span>
    <span className="text-text-secondary font-mono">{value}</span>
  </div>
);
