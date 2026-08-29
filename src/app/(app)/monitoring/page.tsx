import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarCheck, ClipboardList, Flag, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { scopedOrgWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { getSelectedAy } from "@/lib/ay-server";
import { formatMoney, formatDateTime } from "@/lib/utils";
import {
  attendanceRate,
  monitorOrg,
  summarizeMonitoring,
  type MonitoredActivity,
  type OrgMonitoring,
} from "@/lib/monitoring";
import { ACTIVITY_PHASE_META } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProportionBar } from "@/components/ui/charts";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
export const instant = false;

export const metadata: Metadata = { title: "Activity Monitoring" };


export default async function MonitoringPage() {
  const user = await requirePermission("org.view");
  const ay = await getSelectedAy();
  const now = new Date();

  const [orgRows, activityRows] = await Promise.all([
    db.organization.findMany({
      where: scopedOrgWhere(user, { status: "ACTIVE" }),
      select: {
        id: true,
        name: true,
        acronym: true,
        college: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.activityProposal.findMany({
      where: {
        academicYear: ay,
        organization: { is: scopedOrgWhere(user, { status: "ACTIVE" }) },
      },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        phase: true,
        scope: true,
        venue: true,
        startAt: true,
        endAt: true,
        estimatedBudget: true,
        expectedParticipants: true,
        organizationId: true,
        report: {
          select: { status: true, actualParticipants: true, actualBudget: true },
        },
        _count: { select: { attendanceRecords: true } },
      },
    }),
  ]);

  const byOrg = new Map<string, typeof activityRows>();
  for (const a of activityRows) {
    const list = byOrg.get(a.organizationId);
    if (list) list.push(a);
    else byOrg.set(a.organizationId, [a]);
  }

  const monitored: OrgMonitoring[] = orgRows.map((o) =>
    monitorOrg(
      { id: o.id, name: o.name, acronym: o.acronym, collegeName: o.college?.name ?? null },
      (byOrg.get(o.id) ?? []).map((a): MonitoredActivity => ({
        id: a.id,
        title: a.title,
        status: a.status,
        phase: a.phase,
        scope: a.scope,
        venue: a.venue,
        startAt: a.startAt,
        endAt: a.endAt,
        estimatedBudget: a.estimatedBudget,
        actualBudget: a.report?.actualBudget ?? null,
        expectedParticipants: a.expectedParticipants,
        actualParticipants: a.report?.actualParticipants ?? null,
        attendanceCount: a._count.attendanceRecords,
        reportStatus: a.report?.status ?? null,
      })),
      now
    )
  );
  monitored.sort((a, b) => (a.acronym ?? a.name).localeCompare(b.acronym ?? b.name));
  const summary = summarizeMonitoring(monitored);

  const attention = monitored
    .flatMap((o) => o.endedWithoutReport.map((a) => ({ org: o, activity: a })))
    .sort((a, b) => b.activity.endAt.getTime() - a.activity.endAt.getTime())
    .slice(0, 8);

  return (
    <>
      <PageHeader
        title="Activity Monitoring"
        description={`Plan of activities monitoring & evaluation · AY ${ay}`}
        breadcrumb={[{ label: "Activity Monitoring" }]}
        actions={
          <Link
            href="/monitoring/report"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-content hover:border-primary"
          >
            <ClipboardList className="size-4" aria-hidden /> Monitoring report
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Planned activities" value={summary.planned} icon={CalendarCheck} hint={`${summary.orgCount} organizations · AY`} />
        <StatCard label="Approved" value={summary.approved} icon={Flag} iconTone="success" hint="approved or completed" />
        <StatCard label="Completed" value={summary.completed} icon={ClipboardList} iconTone="info" hint="marked complete" />
        <StatCard label="Ended, no report" value={summary.unreportedTotal} icon={AlertTriangle} iconTone="danger" hint="evaluation follow-up needed" />
        <StatCard
          label="Budget utilization"
          value={summary.budgetPlanned > 0 ? `${Math.round((summary.budgetActual / summary.budgetPlanned) * 100)}%` : "—"}
          icon={Wallet}
          iconTone="warning"
          hint={`${formatMoney(summary.budgetActual)} of ${formatMoney(summary.budgetPlanned)}`}
        />
      </div>

      {attention.length > 0 && (
        <Card className="mb-6 border-danger/40">
          <CardHeader
            title="Needs evaluation"
            description="These activities have ended but no accomplishment report has been filed yet."
          />
          <CardContent>
            <ul className="space-y-2">
              {attention.map(({ org, activity }) => (
                <li key={activity.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-content">{activity.title}</p>
                    <p className="text-xs text-content-secondary">
                      {org.acronym ?? org.name} · ended {formatDateTime(activity.endAt)}
                      {activity.venue ? ` · ${activity.venue}` : ""}
                    </p>
                  </div>
                  <Link href={`/activities/${activity.id}`} className="text-xs font-semibold text-primary hover:underline">
                    Review →
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader title="Per-organization pipeline" description={`Activity proposal outcomes for AY ${ay}.`} />
        <CardContent>
          <TableWrap>
            <THead>
              <TH>Organization</TH>
              <TH>Pipeline</TH>
              <TH>Planned</TH>
              <TH>Completed</TH>
              <TH>Unreported</TH>
              <TH>Budget (actual / planned)</TH>
              <TH>Next up</TH>
            </THead>
              <tbody>
                {monitored.map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <Link href={`/organizations/${o.id}`} className="font-semibold text-content hover:text-primary">
                        {o.acronym ?? o.name}
                      </Link>
                      <span className="block text-[11px] text-content-secondary">{o.collegeName}</span>
                    </TD>
                    <TD className="min-w-36">
                      {o.planned > 0 ? (
                        <ProportionBar value={o.approved} total={o.planned} />
                      ) : (
                        <span className="text-xs text-content-muted">nothing planned</span>
                      )}
                    </TD>
                    <TD className="tabular-nums">{o.planned}</TD>
                    <TD className="tabular-nums">{o.completed}</TD>
                    <TD className="tabular-nums">
                      {o.endedWithoutReport.length > 0 ? (
                        <Badge tone="danger">{o.endedWithoutReport.length}</Badge>
                      ) : (
                        <span className="text-xs text-content-muted">—</span>
                      )}
                    </TD>
                    <TD className="tabular-nums text-xs">
                      {formatMoney(o.budgetActual)} / {formatMoney(o.budgetPlanned)}
                    </TD>
                    <TD>
                      {(() => {
                        const next = o.upcoming[0];
                        if (!next) return <span className="text-xs text-content-muted">none scheduled</span>;
                        return (
                          <>
                            <Link href={`/activities/${next.id}`} className="block max-w-52 truncate text-xs font-semibold text-content hover:text-primary">
                              {next.title}
                            </Link>
                            <span className="text-[11px] text-content-secondary">{formatDateTime(next.startAt)}</span>
                          </>
                        );
                      })()}
                    </TD>
                  </TR>
                ))}
                {monitored.length === 0 && (
                  <TR>
                    <td colSpan={7} className="py-8 text-center text-sm text-content-muted">
                      No active organizations in your scope yet.
                    </td>
                  </TR>
                )}
              </tbody>
          </TableWrap>
        </CardContent>
      </Card>

      {monitored.some((o) => o.activities.length > 0) && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {monitored
            .filter((o) => o.activities.length > 0)
            .map((o) => (
              <Card key={o.id}>
                <CardHeader
                  title={o.acronym ?? o.name}
                  description={`${o.approved} approved · ${o.completed} completed · ${o.returned} returned for revision`}
                />
                <CardContent>
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {o.activities.map((a) => {
                      const rate = attendanceRate(a);
                      const phaseMeta = ACTIVITY_PHASE_META[a.phase ?? "PLAN"];
                      return (
                        <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <Link href={`/activities/${a.id}`} className="block truncate text-sm font-semibold text-content hover:text-primary">
                              {a.title}
                            </Link>
                            <p className="text-[11px] text-content-secondary">
                              {formatDateTime(a.startAt)}
                              {a.venue ? ` · ${a.venue}` : ""}
                              {rate != null ? ` · attendance ${rate}%` : ""}
                              {a.actualBudget != null && a.estimatedBudget != null && a.actualBudget !== a.estimatedBudget
                                ? ` · budget ${formatMoney(a.actualBudget)} vs ${formatMoney(a.estimatedBudget)}`
                                : ""}
                            </p>
                          </div>
                          <Badge tone={phaseMeta?.tone ?? "neutral"}>{phaseMeta?.label ?? a.phase ?? a.status}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </>
  );
}
