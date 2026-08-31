import { Activity, Award, CheckCircle2, Clock, Flag, ListChecks, ShieldAlert, Users, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BarChart } from "@/components/ui/charts";
import { StatCard } from "@/components/ui/stat-card";
import { NoData } from "@/components/analytics/analytics-parts";
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
  meStats?: { implemented: number; notImplemented: number; rescheduled: number; pending: number; total: number };
};

export function AnalyticsMonitoring(p: AnalyticsMonitoringProps) {
  const fallback = evaluationSummary(p.monitored, p.overallAttendance);
  const loaded = p.realEval.count > 0 || fallback.loaded;

  return (
    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
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
                    <ArcRail key={d.label} label={d.label} avg={d.avg} pct={d.pct} />
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
      <Card>
        <CardHeader
          title="Implementation status"
          description="Activity monitoring outcomes recorded by organizations. Activities must be marked Implemented before their accomplishment report can be filed."
        />
        <CardContent>
          {p.meStats && p.meStats.total > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Implemented" value={p.meStats.implemented} icon={CheckCircle2} iconTone="success" hint={`${p.meStats.total > 0 ? Math.round((p.meStats.implemented / p.meStats.total) * 100) : 0}% rate`} />
                <StatCard label="Not implemented" value={p.meStats.notImplemented} icon={XCircle} iconTone="danger" />
                <StatCard label="Rescheduled" value={p.meStats.rescheduled} icon={Clock} iconTone="warning" />
                <StatCard label="Pending" value={p.meStats.pending} icon={Activity} iconTone="info" hint="no outcome recorded yet" />
              </div>
              {p.meStats.total > 0 && (
                <div className="rounded-xl border border-line px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-content">Implementation rate</p>
                    <span className="text-lg font-bold tabular-nums text-success">
                      {Math.round((p.meStats.implemented / p.meStats.total) * 100)}%
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-surface-secondary"
                    role="meter"
                    aria-valuenow={Math.round((p.meStats.implemented / p.meStats.total) * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Implementation rate ${Math.round((p.meStats.implemented / p.meStats.total) * 100)}%`}
                  >
                    <div
                      className="h-full rounded-full bg-success"
                      style={{ width: `${Math.round((p.meStats.implemented / p.meStats.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <NoData what="No activity monitoring outcomes recorded yet." />
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
      <div className="flex items-center gap-2">
        {util != null && (
          <div
            className="h-2 w-36 overflow-hidden rounded-full bg-surface-secondary"
            role="meter"
            aria-valuenow={Math.round(util)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Budget utilization ${Math.round(util)}%`}
          >
            <div
              className={`h-full rounded-full ${util > 105 ? "bg-danger" : util >= 100 ? "bg-warning" : "bg-success"}`}
              style={{ width: `${Math.min(Math.round(util), 100)}%` }}
            />
          </div>
        )}
        <span className={`w-12 text-right font-display text-lg font-bold tabular-nums ${util != null && util > 105 ? "text-danger" : "text-content"}`}>
          {util != null ? `${Math.round(util)}%` : "—"}
        </span>
      </div>
    </div>
  );
}

/**
 * The single gold signature of the analytics workspace: each officer-entered
 * rubric dimension read as a gold rail against its 5-point scale. Gold is used
 * only here — measured achievement — so nothing else on the page competes.
 */
function ArcRail({
  label,
  avg,
  pct,
}: {
  label: string;
  avg: number;
  pct: number;
}) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-content">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-content">avg {avg}/5</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-secondary"
        role="meter"
        aria-valuenow={avg}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-label={`${label}: average ${avg} of 5`}
      >
        <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}