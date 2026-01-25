import React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Shield, ShieldAlert, Code, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, ScrollArea } from "@/components/ui";
import type { RiskAnalysis, RiskLevel, DetectedRisk } from "@/types";
import { Section } from "./Section";

interface RiskAnalysisSectionProps {
  riskAnalysis: RiskAnalysis;
}

const RiskIcon: React.FC<{ level: RiskLevel; className?: string }> = ({ level, className }) => {
  switch (level) {
    case "high":
      return <ShieldAlert className={cn("text-permission-high", className)} />;
    case "medium":
      return <AlertTriangle className={cn("text-permission-medium", className)} />;
    case "low":
      return <Shield className={cn("text-permission-low", className)} />;
  }
};

const RiskBadge: React.FC<{ level: RiskLevel }> = ({ level }) => {
  const { t } = useTranslation();
  
  const levelKey = level === "low" 
    ? "skillDetail.lowRisk" 
    : level === "medium" 
    ? "skillDetail.mediumRisk" 
    : "skillDetail.highRisk";
  
  return (
    <Badge variant={level} className="text-[10px]">
      {t(levelKey)}
    </Badge>
  );
};

const RiskItem: React.FC<{ risk: DetectedRisk }> = ({ risk }) => {
  const { t } = useTranslation();
  
  return (
    <div className="flex items-start gap-2 rounded-md border border-border-muted bg-bg-tertiary p-2">
      <RiskIcon level={risk.level} className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-text-primary">
            {t(`riskCategory.${risk.category}`, { defaultValue: risk.category })}
          </span>
          <RiskBadge level={risk.level} />
          {risk.line && (
            <span className="text-[10px] text-text-muted">
              {t("riskAnalysis.lineNumber", { line: risk.line })}
            </span>
          )}
        </div>
        <p className="text-[11px] text-text-secondary mt-0.5">
          {risk.description}
        </p>
        <code className="text-[10px] text-accent-blue bg-bg-elevated px-1 py-0.5 rounded mt-1 inline-block">
          {risk.pattern}
        </code>
      </div>
    </div>
  );
};

export const RiskAnalysisSection: React.FC<RiskAnalysisSectionProps> = ({ riskAnalysis }) => {
  const { t } = useTranslation();
  
  const hasRisks = riskAnalysis.detectedRisks.length > 0;
  // Markdown files are not executable code, even if detected as such
  const isExecutable = riskAnalysis.isExecutableCode && riskAnalysis.fileExtension !== "md";
  
  // Group risks by level
  const highRisks = riskAnalysis.detectedRisks.filter(r => r.level === "high");
  const mediumRisks = riskAnalysis.detectedRisks.filter(r => r.level === "medium");
  const lowRisks = riskAnalysis.detectedRisks.filter(r => r.level === "low");
  
  return (
    <Section 
      title={t("riskAnalysis.title")} 
      icon={<FileCode className="h-3.5 w-3.5" />}
    >
      {/* Executable code indicator */}
      {isExecutable && (
        <div className="flex items-center gap-2 mb-3 text-xs">
          <Code className="h-4 w-4 text-accent-blue" />
          <span className="text-text-secondary">
            {t("riskAnalysis.executableCode")}
          </span>
          {riskAnalysis.fileExtension && (
            <Badge variant="blue" className="text-[10px]">
              .{riskAnalysis.fileExtension}
            </Badge>
          )}
        </div>
      )}
      
      {/* Overall risk level */}
      {riskAnalysis.overallLevel && (
        <div className="flex items-center justify-between mb-3 p-2 rounded-md border border-border-default bg-bg-tertiary">
          <span className="text-xs text-text-muted">{t("riskAnalysis.overallRisk")}</span>
          <div className="flex items-center gap-2">
            <RiskIcon level={riskAnalysis.overallLevel} className="h-4 w-4" />
            <RiskBadge level={riskAnalysis.overallLevel} />
          </div>
        </div>
      )}
      
      {/* Risk list */}
      {hasRisks ? (
        <ScrollArea className="max-h-64">
          <div className="space-y-2">
            {/* High risks first */}
            {highRisks.map((risk, idx) => (
              <RiskItem key={`high-${idx}`} risk={risk} />
            ))}
            {/* Medium risks */}
            {mediumRisks.map((risk, idx) => (
              <RiskItem key={`medium-${idx}`} risk={risk} />
            ))}
            {/* Low risks */}
            {lowRisks.map((risk, idx) => (
              <RiskItem key={`low-${idx}`} risk={risk} />
            ))}
          </div>
        </ScrollArea>
      ) : (
        <p className="text-xs text-text-muted">{t("riskAnalysis.noRisks")}</p>
      )}
      
      {/* Warning for high-risk code */}
      {riskAnalysis.overallLevel === "high" && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-permission-high/50 bg-permission-high/10 p-3">
          <ShieldAlert className="h-4 w-4 text-permission-high shrink-0 mt-0.5" />
          <p className="text-xs text-permission-high">
            {t("riskAnalysis.codeWarning")}
          </p>
        </div>
      )}
    </Section>
  );
};
