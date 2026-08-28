import Link from "next/link";
import { Flag, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
import { NoData } from "@/components/analytics/analytics-parts";
import { attendanceRate, type OrgMonitoring } from "@/lib/monitoring";
import { budgetUtilizationPct } from "@/lib/analytics";

export type DrillActivitiesProps = {
  mon: OrgMonitoring;
  avgAttendance: number | null;
};

export function DrillActivities(p: DrillActivitiesProps) {
  const { mon } = p;
  return (
    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Activities" description="Pipeline and implementation for this cycle." />
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Planned" value={mon.planned} icon={Flag} />
            <StatCard label="Approved" value={mon.approved} icon={Flag} iconTone="info" />
            <StatCard label="Completed" value={mon.completed} icon={Flag} iconTone="success" />
            <StatCard label="Unreported" value={mon.endedWithoutReport.length} icon={Flag} iconTone={mon.endedWithoutReport.length > 0 ? "danger" : "neutral"} />
          </div>
          {mon.activities.length > 0 ? (
            <TableWrap>
              <THead>
                <TH>Activity</TH>
                <TH>Status</TH>
                <TH>Attendance</TH>
              </THead>
              <tbody>
                {mon.activities.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <Link href={`/activities/${a.id}`} className="font-semibold text-content hover:text-primary">
                        {a.title}
                      </Link>
                    </TD>
                    <TD className="min-w-32">
                      <Badge tone={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "danger" : a.status === "RETURNED" ? "warning" : "info"}>
                        {a.status}
                      </Badge>
                    </TD>
                    <TD className="min-w-20 tabular-nums">
                      {attendanceRate(a) != null ? `${attendanceRate(a)}%` : <span className="text-xs text-content-muted">—</span>}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <NoData what="No activities have been filed for this academic year." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Monitoring & evaluation" description="Recorded evaluation indicators — no invented rating or grade." />
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Budget utilized" value={`${budgetUtilizationPct(mon.budgetPlanned, mon.budgetActual) ?? 0}%`} icon={Wallet} iconTone="warning" />
            <StatCard label="Avg attendance" value={p.avgAttendance != null ? `${p.avgAttendance}%` : "—"} icon={Users} iconTone="info" />
          </div>
          <ul className="space-y-2 text-sm text-content-secondary">
            <li className="flex justify-between gap-2 rounded-lg border border-line px-3 py-2">
              <span>Activities evaluated (ended)</span>
              <span className="font-semibold tabular-nums text-content">{mon.completed + mon.endedWithoutReport.length}</span>
            </li>
            <li className="flex justify-between gap-2 rounded-lg border border-line px-3 py-2">
              <span>Ended without report</span>
              <span className="font-semibold tabular-nums text-content">{mon.endedWithoutReport.length}</span>
            </li>
            <li className="flex justify-between gap-2 rounded-lg border border-line px-3 py-2">
              <span>Pending follow-up</span>
              <span className="font-semibold tabular-nums text-content">{mon.upcoming.length}</span>
            </li>
          </ul>
          {mon.endedWithoutReport.length > 0 && (
            <p className="rounded-lg bg-danger-light px-3 py-2 text-xs font-semibold text-danger">
              Recommendation: evaluate the {mon.endedWithoutReport.length} ended activit{mon.endedWithoutReport.length === 1 ? "y without a report" : "ies without a report"} and follow up with the organization.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}