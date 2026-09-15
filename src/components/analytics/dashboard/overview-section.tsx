import { AnalyticsKpis, type AnalyticsKpiProps } from "./kpi-section";

/**
 * The Overview panel: the balanced register standing at a glance. The four
 * KPI cards carry the heads of the register (roll, accreditation, financial,
 * activity), with each measure defined exactly once — the exception-ledger
 * figures that need action live on the folio strip above and in the
 * Alerts and Data Quality views.
 */
export function AnalyticsOverview(p: AnalyticsKpiProps) {
  return <AnalyticsKpis {...p} />;
}