import React from "react";
import { useTranslation } from "react-i18next";
import { Folder, ExternalLink, FileText } from "lucide-react";
import type { Skill } from "@/types";
import { Section } from "./Section";

interface SourceTabProps {
  skill: Skill;
  content: string | null | undefined;
}

export const SourceTab: React.FC<SourceTabProps> = ({ skill, content }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* File location */}
      <Section title={t("skillDetail.fileLocation")} icon={<Folder className="h-3.5 w-3.5" />}>
        <div className="rounded-md border border-border-muted bg-bg-tertiary p-2">
          <code className="text-xs text-text-secondary break-all">
            {skill.localPath}
          </code>
        </div>
      </Section>

      {/* Source URL */}
      {skill.sourceUrl && (
        <Section title={t("skillDetail.sourceUrl")} icon={<ExternalLink className="h-3.5 w-3.5" />}>
          <a
            href={skill.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent-blue hover:underline break-all"
          >
            {skill.sourceUrl}
          </a>
        </Section>
      )}

      {/* Raw source */}
      <Section title={t("skillDetail.rawSource")} icon={<FileText className="h-3.5 w-3.5" />}>
        {content ? (
          <pre className="text-[11px] text-text-secondary bg-bg-tertiary rounded-md p-3 overflow-x-auto max-h-96 whitespace-pre-wrap">
            {content}
          </pre>
        ) : (
          <div className="text-xs text-text-muted text-center py-4">
            {t("common.loading")}...
          </div>
        )}
      </Section>
    </div>
  );
};
