import React from "react";
import { useTranslation } from "react-i18next";
import { Markdown } from "@/components/ui";

interface ContentTabProps {
  content: string | null | undefined;
}

export const ContentTab: React.FC<ContentTabProps> = ({ content }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {content ? (
        <Markdown 
          content={content.replace(/^---[\s\S]*?---\n/, '')} 
          className="text-xs"
        />
      ) : (
        <div className="text-xs text-text-muted text-center py-8">
          {t("common.loading")}...
        </div>
      )}
    </div>
  );
};
