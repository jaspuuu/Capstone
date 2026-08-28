import { DonutChart, LineChart } from "@/components/ui/charts";
import { KpiCard, NoData } from "@/components/analytics/analytics-parts";
import {
  activityPlannedTotal,
  activityStatusSlices,
  overallActivityCompletion,
} from "@/lib/analytics-ui";
import type { OrgMonitoring } from "@/lib/monitoring";

export type AnalyticsKpiProps = {
  orgsCount: number;
  recognized: number;
  pending: number;
  expired: number;
  renewal: number;
  none: number;
  avgCompliance: number | null;
  compDelta: number | null;
  activeScoreCount: number;
  compTrend: { label: string; value: number }[];
  finCounts: { SUBMITTED: number; OVERDUE: number; PENDING: number };
  monitored: OrgMonitoring[];
};

export function AnalyticsKpis(p: AnalyticsKpiProps) {
  const completion = activityPlannedTotal(p.monitored);
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Organizations"
        value={`${p.orgsCount}`}
        hint={`${p.recognized} recognized · ${p.pending} pending · ${p.expired} expired · ${p.renewal} for renewal · ${p.none} no application`}
      >
        <DonutChart
          data={[
            { label: "Recognized", value: p.recognized, tone: "success" },
            { label: "Pending", value: p.pending, tone: "warning" },
            { label: "Expired", value: p.expired, tone: "neutral" },
            { label: "For renewal", value: p.renewal, tone: "info" },
            { label: "No application", value: p.none, tone: "muted" },
          ]}
          ariaLabel="Organizations by recognition state"
        />
      </KpiCard>
      <KpiCard
        label="Accreditation compliance"
        value={p.avgCompliance != null ? `${p.avgCompliance}%` : "—"}
        delta={p.compDelta}
        hint={`average of the 7-item SF-001 checklist across ${p.activeScoreCount} active organizations`}
      >
        {p.compTrend.length > 0 ? (
          <LineChart data={p.compTrend} ariaLabel="Average accreditation compliance per academic year" />
        ) : (
          <NoData what="Not enough completed records to compute a compliance trend for the selected period." />
        )}
      </KpiCard>
      <KpiCard label="Financial compliance" value={`${p.finCounts.SUBMITTED}`} valueHint="submitted" hint="CAPS scope: submission status only">
        <DonutChart
          data={[
            { label: "Submitted", value: p.finCounts.SUBMITTED, tone: "success" },
            { label: "Overdue", value: p.finCounts.OVERDUE, tone: "danger" },
            { label: "Unsubmitted", value: p.finCounts.PENDING, tone: "warning" },
          ]}
          ariaLabel="Financial compliance status distribution"
        />
      </KpiCard>
      <KpiCard
        label="Activity completion"
        value={completion > 0 ? `${overallActivityCompletion(p.monitored)}%` : "—"}
        valueHint="of planned"
        hint="completed activities ÷ planned (— means none planned yet)"
      >
        <DonutChart data={activityStatusSlices(p.monitored)} ariaLabel="Activities by implementation state" />
      </KpiCard>
    </div>
  );
}