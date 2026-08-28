import { ComplianceMatrix, type MatrixRow } from "@/components/analytics/matrix-table";
import { SectionCard } from "@/components/analytics/analytics-parts";
import { AnalyticsKpis, type AnalyticsKpiProps } from "./kpi-section";
import { AnalyticsDiagnostics, type AnalyticsDiagnosticsProps } from "./diagnostics-section";
import { AnalyticsTrends, type AnalyticsTrendsProps } from "./trends-section";
import { AnalyticsMonitoring, type AnalyticsMonitoringProps } from "./monitoring-section";
import { AnalyticsAlerts, type AnalyticsAlertsProps } from "./alerts-section";
import { AnalyticsIntegrity, type AnalyticsIntegrityProps } from "./integrity-section";

export type AnalyticsDashboardProps = {
  kpis: AnalyticsKpiProps;
  matrixRows: MatrixRow[];
  diagnostics: AnalyticsDiagnosticsProps;
  trends: AnalyticsTrendsProps;
  monitoring: AnalyticsMonitoringProps;
  alerts: AnalyticsAlertsProps;
  integrity: AnalyticsIntegrityProps;
};

/** The full five-layer dashboard, composed from focused section components. */
export function AnalyticsDashboard(p: AnalyticsDashboardProps) {
  return (
    <>
      <AnalyticsKpis {...p.kpis} />

      <SectionCard
        className="mb-6"
        title="Organization compliance matrix"
        description="Recognition · requirements · financial · activities per organization. Click any organization for its full analytics."
      >
        <ComplianceMatrix rows={p.matrixRows} />
      </SectionCard>

      <AnalyticsDiagnostics {...p.diagnostics} />
      <AnalyticsTrends {...p.trends} />
      <AnalyticsMonitoring {...p.monitoring} />
      <AnalyticsAlerts {...p.alerts} />
      <AnalyticsIntegrity {...p.integrity} />
    </>
  );
}