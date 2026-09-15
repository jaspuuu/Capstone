import { PartLabel } from "@/components/analytics/analytics-parts";
import { AnalyticsTabBar, type AnalyticsView } from "./tabs";
import { AnalyticsOverview } from "./overview-section";
import { AnalyticsCompliance } from "./compliance-section";
import { AnalyticsTrends, type AnalyticsTrendsProps } from "./trends-section";
import { AnalyticsMonitoring, type AnalyticsMonitoringProps } from "./monitoring-section";
import { AnalyticsAlerts, type AnalyticsAlertsProps } from "./alerts-section";
import { AnalyticsIntegrity, type AnalyticsIntegrityProps } from "./integrity-section";
import type { AnalyticsKpiProps } from "./kpi-section";
import type { AnalyticsDiagnosticsProps } from "./diagnostics-section";
import type { MatrixRow } from "@/components/analytics/matrix-table";

export type AnalyticsDashboardProps = {
  view: AnalyticsView;
  kpis: AnalyticsKpiProps;
  matrixRows: MatrixRow[];
  diagnostics: AnalyticsDiagnosticsProps;
  trends: AnalyticsTrendsProps;
  monitoring: AnalyticsMonitoringProps;
  alerts: AnalyticsAlertsProps;
  integrity: AnalyticsIntegrityProps;
};

const PANEL_NOTE: Record<AnalyticsView, string> = {
  overview: "Register standing at a glance — every KPI is defined exactly once",
  compliance: "The roll, one organization per line, with the audit underneath",
  trends: "Accreditation, membership and activity pace across academic years",
  activities: "Attendance, budget, M&E and implementation outcomes",
  alerts: "Every alert is emitted by an explicit rule with a recommended action",
  quality: "Record-level completeness flags for OSAS follow-up",
};

const PANEL_NAME: Record<AnalyticsView, string> = {
  overview: "Overview",
  compliance: "Compliance",
  trends: "Trends",
  activities: "Activities",
  alerts: "Alerts",
  quality: "Data Quality",
};

/**
 * The analytical register laid out as six views. Panel content is rendered
 * server-side from the `view` query parameter; `AnalyticsTabBar` (client)
 * only rewrites that parameter, so each panel is a shareable URL.
 */
export function AnalyticsDashboard(p: AnalyticsDashboardProps) {
  let panel: React.ReactNode;
  switch (p.view) {
    case "compliance":
      panel = (
        <AnalyticsCompliance matrixRows={p.matrixRows} diagnostics={p.diagnostics} />
      );
      break;
    case "trends":
      panel = <AnalyticsTrends {...p.trends} />;
      break;
    case "activities":
      panel = <AnalyticsMonitoring {...p.monitoring} />;
      break;
    case "alerts":
      panel = <AnalyticsAlerts {...p.alerts} />;
      break;
    case "quality":
      panel = <AnalyticsIntegrity {...p.integrity} />;
      break;
    default:
      panel = <AnalyticsOverview {...p.kpis} />;
  }

  return (
    <>
      <AnalyticsTabBar
        active={p.view}
        alertCount={p.alerts.alerts.length}
        issueCount={p.integrity.dataIssues.length}
      />
      <PartLabel numeral="REGISTER" name={PANEL_NAME[p.view]} note={PANEL_NOTE[p.view]} />
      {panel}
    </>
  );
}