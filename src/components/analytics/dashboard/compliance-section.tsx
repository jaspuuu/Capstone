import { ComplianceMatrix, type MatrixRow } from "@/components/analytics/matrix-table";
import { SectionCard } from "@/components/analytics/analytics-parts";
import { AnalyticsDiagnostics, type AnalyticsDiagnosticsProps } from "./diagnostics-section";

export type AnalyticsComplianceProps = {
  matrixRows: MatrixRow[];
  diagnostics: AnalyticsDiagnosticsProps;
};

/**
 * The Compliance panel: the register roll (every organization, one line) with
 * the audit underneath — the SF-001 items organizations keep missing, where
 * workflows stall, and how applications get stuck in revision.
 */
export function AnalyticsCompliance(p: AnalyticsComplianceProps) {
  return (
    <>
      <SectionCard
        className="mb-6"
        title="Organization compliance matrix"
        description="Recognition · requirements · financial · activities per organization. Click any organization for its full analytics."
      >
        <ComplianceMatrix rows={p.matrixRows} />
      </SectionCard>
      <AnalyticsDiagnostics {...p.diagnostics} />
    </>
  );
}