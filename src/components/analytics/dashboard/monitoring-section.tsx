import { Activity, Award, Flag, ListChecks, ShieldAlert, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BarChart } from "@/components/ui/charts";
import { StatCard } from "@/components/ui/stat-card";
import { HBar, NoData } from "@/components/analytics/analytics-parts";
import { evalHint, evaluationSummary } from "@/lib/analytics-ui";
import { formatMoney } from "@/lib/utils";
import type { OrgMonitoring } from "@/lib/monitoring";
import { budgetUtilizationPct, type EvaluationStats } from "@/lib/analytics";

export type AnalyticsMonitoringProps = {
  monitored: OrgMonitoring[];
  attRates: number[];
  overallAttendance: number | null;
  attendanceHighest: { label: string; value: number } | null;
  attendanceLowest: { label: string; value: number } | null;
  origByRate: { label: string; value: number }[];
  realEval: EvaluationStats;
  evaluations: { activity: { organizationId: string } }[];
};

export function AnalyticsMonitoring(p: AnalyticsMonitoringProps) {
  const fallback = evaluationSummary(p.monitored, p.overallAttendance);
  const loaded = p.realEval.count > 0 || fallback.loaded;

  return (
    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Attendance analytics" description="From recorded attendance — registered vs actual, not a score." />
        <CardContent>
          {p.attRates.length > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <StatCard label="Average attendance" value={`${p.overallAttendance}%`} icon={Users} iconTone="info" />
                <StatCard label="Highest" value={p.attendanceHighest ? `${p.attendanceHighest.value}% (${p.attendanceHighest.label})` : "—"} icon={Award} iconTone="success" />
                <StatCard label="Lowest" value={p.attendanceLowest ? `${p.attendanceLowest.value}% (${p.attendanceLowest.label})` : "—"} icon={Flag} iconTone="warning" />
              </div>
              <BarChart data={p.origByRate.slice(0, 8)} ariaLabel="Average attendance by organization" />
            </div>
          ) : (
            <NoData what="No recorded attendance data in the selected scope yet." />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          title="Monitoring & evaluation"
          description={p.realEval.count > 0 ? "Rubric-based evaluations entered by officers (1–5 scale, 5 = best)." : "Integrated evaluation indicators — counts and attendance, no invented rating."}
        />
        <CardContent>
          {loaded ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard label="Orgs evaluated" value={p.realEval.count > 0 ? new Set(p.evaluations.map((e) => e.activity.organizationId)).size : fallback.orgs} icon={ListChecks} />
                <StatCard label="Activities evaluated" value={p.realEval.count > 0 ? p.realEval.count : fallback.activities} icon={Activity} iconTone="info" />
                <StatCard
                  label="Average evaluation"
                  value={p.realEval.avgPct != null ? `${p.realEval.avgPct}%` : fallback.avg != null ? `${fallback.avg}%` : "—"}
                  icon={ShieldAlert}
                  iconTone="warning"
                  hint={p.realEval.avgPct != null ? "officer-entered rubric" : "attendance capture"}
                />
              </div>
              {p.realEval.count > 0 ? (
                <div className="mt-4 space-y-3">
                  {p.realEval.dims.map((d) => (
                    <HBar key={d.label} label={d.label} percent={d.pct} rightText={`avg ${d.avg}/5`} />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-content-secondary">
                  No rubric evaluations entered yet — {evalHint(p.overallAttendance)}. The system records counts, percentages, budget and attendance; no grade scale is invented.
                </p>
              )}
            </>
          ) : (
            <NoData what="No activities with recorded evaluation indicators in this scope yet." />
          )}
          {p.monitored.reduce((s, m) => s + m.budgetPlanned, 0) > 0 && (
            <BudgetUtilizationBar monitored={p.monitored} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BudgetUtilizationBar({ monitored }: { monitored: OrgMonitoring[] }) {
  const planned = monitored.reduce((s, m) => s + m.budgetPlanned, 0);
  const actual = monitored.reduce((s, m) => s + m.budgetActual, 0);
  const util = budgetUtilizationPct(planned, actual);
  return (
    <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-line px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-content">Budget utilization</p>
        <p className="text-xs text-content-secondary">
          {formatMoney(actual)} spent of {formatMoney(planned)} approved
        </p>
      </div>
      <span className={`font-display text-lg font-bold tabular-nums ${util != null && util > 105 ? "text-red-600" : "text-content"}`}>
        {util != null ? `${util}%` : "—"}
      </span>
    </div>
  );
}