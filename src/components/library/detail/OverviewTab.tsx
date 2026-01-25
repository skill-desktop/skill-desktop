import React from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Tag, Shield, Code, Hash, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, Markdown } from "@/components/ui";
import { getPermissionLevel, getSkillRiskLevel } from "@/types";
import type { Skill } from "@/types";
import { Section } from "./Section";
import { MetadataRow } from "./MetadataRow";
import { RiskAnalysisSection } from "./RiskAnalysisSection";

interface OverviewTabProps {
  skill: Skill;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ skill }) => {
  const { t } = useTranslation();
  
  // Get overall risk level considering both permissions and code analysis
  const overallRiskLevel = getSkillRiskLevel(skill);

  return (
    <>
      {/* Description */}
      <Section title={t("skillDetail.description")} icon={<BookOpen className="h-3.5 w-3.5" />}>
        <Markdown 
          content={skill.description || t("skillDetail.noDescription")} 
          className="text-xs text-text-secondary"
        />
      </Section>

      {/* Tags */}
      {skill.tags.length > 0 && (
        <Section title={t("skillDetail.tags")} icon={<Tag className="h-3.5 w-3.5" />}>
          <div className="flex flex-wrap gap-1">
            {skill.tags.map((tag) => (
              <Badge key={tag} variant="blue" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Permissions */}
      <Section title={t("skillDetail.permissions")} icon={<Shield className="h-3.5 w-3.5" />}>
        {skill.permissions.length > 0 ? (
          <div className="space-y-2">
            {skill.permissions.map((permission) => {
              const level = getPermissionLevel(permission);
              return (
                <div
                  key={permission}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        level === "low" && "bg-permission-low",
                        level === "medium" && "bg-permission-medium",
                        level === "high" && "bg-permission-high"
                      )}
                    />
                    <span className="text-xs text-text-primary">
                      {permission}
                    </span>
                  </div>
                  <Badge variant={level} className="text-[10px]">
                    {level === "low"
                      ? t("skillDetail.lowRisk")
                      : level === "medium"
                      ? t("skillDetail.mediumRisk")
                      : t("skillDetail.highRisk")}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-text-muted">{t("skillDetail.noPermissions")}</p>
        )}
      </Section>

      {/* Risk Analysis from code scanning */}
      {skill.riskAnalysis && (
        <RiskAnalysisSection riskAnalysis={skill.riskAnalysis} />
      )}

      {/* Parameters */}
      {skill.parameters.length > 0 && (
        <Section title={t("skillDetail.parameters")} icon={<Code className="h-3.5 w-3.5" />}>
          <div className="space-y-3">
            {skill.parameters.map((param) => (
              <div key={param.name} className="rounded-md border border-border-muted bg-bg-tertiary p-2">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-medium text-accent-blue">
                    {param.name}
                  </code>
                  <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-bg-elevated">
                    {param.type}
                  </span>
                  {param.required && (
                    <span className="text-[10px] text-accent-red">
                      {t("skillDetail.required")}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-secondary mt-1">
                  {param.description}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Metadata */}
      <Section title={t("skillDetail.metadata")} icon={<Hash className="h-3.5 w-3.5" />}>
        <div className="space-y-2 text-xs">
          <MetadataRow label={t("skillDetail.filename")} value={skill.filename} />
          <MetadataRow label={t("skillDetail.hash")} value={skill.hash.slice(0, 12) + "..."} />
          {skill.isDownloaded && (
            <MetadataRow label={t("skillDetail.source")} value={t("skillDetail.downloaded")} />
          )}
        </div>
      </Section>

      {/* Warning for high-risk (from permissions or code analysis) */}
      {overallRiskLevel === "high" && !skill.riskAnalysis && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-permission-high/50 bg-permission-high/10 p-3">
          <AlertTriangle className="h-4 w-4 text-permission-high shrink-0 mt-0.5" />
          <p className="text-xs text-permission-high">
            {t("skillDetail.highRiskWarning")}
          </p>
        </div>
      )}
    </>
  );
};
