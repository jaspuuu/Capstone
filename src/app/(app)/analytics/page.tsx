import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Flag, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { currentAcademicYear, formatDate } from "@/lib/utils";
import {
  activityCompletionPct,
  activityCompleteTrend,
  activityTrend,
  assessRisk,
  bottleneckAlerts,
  budgetAlerts,
  complianceByYear,
  complianceDelta,
  compliancePct,
  dataQualityChecks,
  diagnoseWorkflow,
  evaluateStats,
  financialAlerts,
  financialCompliance,
  prioritySummary,
  reportAlerts,
  requirementsChecklist,
  riskAlerts,
  shortAY,
  signatureBottlenecks,
  stalledAlerts,
} from "@/lib/analytics";
import { attendanceRate, monitorOrg } from "@/lib/monitoring";
import { RECOGNITION_WORKFLOW, inFlightStatuses } from "@/lib/workflow";
import { RECOGNITION_STATUS_META } from "@/lib/constants";
import { FIN_META, deadlineAppliesLite } from "@/lib/analytics-ui";
import { buildAnalyticsSnapshotMemo } from "@/lib/analytics-loader";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { ExportAnalyticsLink, NoData } from "@/components/analytics/analytics-parts";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { AnalyticsDashboard } from "@/components/analytics/dashboard";
import type { MatrixRow, MatrixTone } from "@/components/analytics/matrix-table";

export const metadata: Metadata = { title: "Analytics" };

const SATISFIED = ["APPROVED", "RECOGNIZED"];

const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, INFO: 3 } as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const toStr = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const now = new Date();
  const ay = toStr(sp.ay) || currentAcademicYear();
  const full = can(user, "analytics.view");

  // ---- Personal branch (MEMBER): their own activities, attendance, memberships.
  if (user.role === "MEMBER") {
    const [memberships, attendance] = await Promise.all([
      db.organizationMember.findMany({
        where: { userId: user.id, isCurrent: true },
        select: {
          organization: { select: { id: true, name: true, acronym: true } },
          position: true,
          status: true,
          academicYear: true,
        },
      }),
      db.activityAttendance.findMany({
        where: { userId: user.id },
        select: {
          status: true,
          recordedAt: true,
          activity: {
            select: {
              id: true,
              title: true,
              startAt: true,
              academicYear: true,
              organization: { select: { acronym: true, name: true } },
            },
          },
        },
      }),
    ]);
    const attended = attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE");
    return (
      <>
        <PageHeader
          title="My analytics"
          description="Personal participation — your attendance, memberships, and nothing else."
          breadcrumb={[{ label: "Analytics" }]}
        />
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Memberships" value={memberships.length} icon={Users} iconTone="info" hint="current memberships" />
          <StatCard label="Activities attended" value={attended.length} icon={CalendarCheck} iconTone="success" hint={`${attendance.length} total attendance records`} />
          <StatCard label="Attendance rate" value={attendance.length > 0 ? `${Math.round((attended.length / attendance.length) * 100)}%` : "—"} icon={Flag} iconTone="warning" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Memberships" />
            <CardContent>
              {memberships.length > 0 ? (
                <ul className="space-y-2">
                  {memberships.map((m) => (
                    <li key={`${m.organization.id}-${m.academicYear}`} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                      <Link href={`/organizations/${m.organization.id}`} className="font-semibold text-content hover:text-primary">
                        {m.organization.acronym ?? m.organization.name}
                      </Link>
                      <div className="flex items-center gap-2">
                        <Badge tone="neutral">{m.position}</Badge>
                        <span className="text-xs text-content-secondary">{m.academicYear}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <NoData what="You are not a current member of any organization." />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Activities attended" description="Records from manual marking and QR check-in." />
            <CardContent>
              {attendance.length > 0 ? (
                <ul className="space-y-2">
                  {attendance.map((a) => (
                    <li key={`${a.activity.id}-${a.recordedAt.toISOString()}`} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                      <div className="min-w-0">
                        <Link href={`/activities/${a.activity.id}`} className="block truncate font-semibold text-content hover:text-primary">
                          {a.activity.title}
                        </Link>
                        <span className="text-xs text-content-secondary">
                          {a.activity.organization.acronym ?? a.activity.organization.name} · {formatDate(a.activity.startAt)}
                        </span>
                      </div>
                      <Badge tone={a.status === "PRESENT" || a.status === "LATE" ? "success" : "neutral"}>{a.status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <NoData what="You have not attended any recorded activities yet." />
              )}
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // ---- Scoped organizational analytics for every other role. ---------------
  const snapshot = await buildAnalyticsSnapshotMemo(user, {
    ay,
    org: toStr(sp.org) || undefined,
    type: toStr(sp.type) || undefined,
    college: toStr(sp.college) || undefined,
    rec: toStr(sp.rec) || undefined,
  });
  const orgsScoped = snapshot.orgs;
  const orgs = snapshot.allOrgs;
  const { deadlines, memberRows, events, currentSteps, evaluations, collegeIdByOrg, collegeOpts } = snapshot;

  const years = [
    ...new Set(
      [...orgs.flatMap((o) => o.recognitions.map((r) => r.academicYear)), ay, currentAcademicYear()].sort()
    ),
  ];

  // ---- Layer 1: descriptive aggregates ----------------------------------------
  const recOf = (o: (typeof orgsScoped)[number]) => o.recognitions.find((r) => r.academicYear === ay);
  const recognizedCount = orgsScoped.filter((o) => {
    const r = recOf(o);
    return r ? SATISFIED.includes(r.status) : o.recognitions.some((x) => SATISFIED.includes(x.status) && x.academicYear < ay);
  }).length;
  const pendingCount = orgsScoped.filter((o) => {
    const r = recOf(o);
    return r != null && inFlightStatuses(RECOGNITION_WORKFLOW).includes(r.status as never);
  }).length;
  const expiredCount = orgsScoped.filter((o) => recOf(o)?.status === "EXPIRED").length;
  const forRenewalCount = orgsScoped.filter((o) => {
    const r = recOf(o);
    return !r && o.recognitions.some((x) => SATISFIED.includes(x.status) && x.academicYear < ay);
  }).length;
  const notFiled = orgsScoped.length - recognizedCount - pendingCount - expiredCount - forRenewalCount;

  const checklistByOrg = new Map(orgsScoped.map((o) => [o.id, requirementsChecklist(o, ay)] as const));
  const activeScores = [...checklistByOrg.values()]
    .filter((_, i) => orgsScoped[i].status === "ACTIVE")
    .filter((items) => items.length > 0)
    .map(compliancePct);
  const avgCompliance = activeScores.length
    ? Math.round(activeScores.reduce((s, p) => s + p, 0) / activeScores.length)
    : null;
  const compTrend = complianceByYear(orgs);
  const compDelta = complianceDelta(compTrend);

  const financialByOrg = new Map(orgsScoped.map((o) => [o.id, financialCompliance(o, ay, deadlines, collegeIdByOrg[o.id])] as const));
  const finCounts = { SUBMITTED: 0, OVERDUE: 0, PENDING: 0 };
  for (const s of financialByOrg.values()) finCounts[s] += 1;

  const monitored = orgsScoped.map((o) =>
    monitorOrg(
      { id: o.id, name: o.name, acronym: o.acronym, collegeName: o.collegeName },
      o.activities
        .filter((a) => a.academicYear === ay)
        .map((a) => ({
          id: a.id,
          title: "",
          status: a.status,
          phase: a.phase,
          scope: a.scope,
          venue: null,
          startAt: a.startAt,
          endAt: a.endAt,
          estimatedBudget: a.estimatedBudget,
          actualBudget: a.actualBudget,
          expectedParticipants: a.expectedParticipants,
          actualParticipants: a.actualParticipants,
          attendanceCount: a.attendanceCount,
          reportStatus: a.reportStatus,
        })),
      now
    )
  );
  const attRates = monitored.flatMap((m) => m.activities.map((a) => attendanceRate(a)).filter((r): r is number => r != null));
  const overallAttendance = attRates.length
    ? Math.round(attRates.reduce((s, x) => s + x, 0) / attRates.length)
    : null;
  const origByRate = monitored
    .map((m) => ({ label: m.acronym ?? m.name, rate: m.activities.map((a) => attendanceRate(a)).filter((r): r is number => r != null) }))
    .filter((x) => x.rate.length > 0)
    .map((x) => ({
      label: x.label,
      value: Math.round(x.rate.reduce((s, r) => s + r, 0) / x.rate.length),
    }))
    .sort((a, b) => b.value - a.value);
  const attendanceHighest = origByRate[0];
  const attendanceLowest = origByRate[origByRate.length - 1];

  // ---- Layers 4 & 5: alerts + recommendations ----------------------------------
  const risks = assessRisk(orgs, deadlines, collegeIdByOrg);
  const riskAlertsList = riskAlerts(risks).filter((a) => a.orgId && orgsScoped.some((o) => o.id === a.orgId));
  const financialAlertsList = financialAlerts(orgs, ay, deadlines, collegeIdByOrg).filter((a) => orgsScoped.some((o) => o.id === a.orgId));
  const reportAlertsList = reportAlerts(
    monitored.map((m) => ({ orgId: m.id, orgName: m.acronym ?? m.name, count: m.endedWithoutReport.length }))
  );
  const stalled: { entityId: string; orgId: string; orgName: string; kind: string; status: string; updatedAt: Date }[] = [];
  for (const o of orgsScoped) {
    const rec = recOf(o);
    if (rec && inFlightStatuses(RECOGNITION_WORKFLOW).includes(rec.status as never)) {
      const updatedAt = new Date(rec.updatedAt as unknown as string);
      if (now.getTime() - updatedAt.getTime() > 14 * 86_400_000) {
        stalled.push({
          entityId: `/recognition/${rec.id}`,
          orgId: o.id,
          orgName: o.acronym ?? o.name,
          kind: "accreditation application",
          status: RECOGNITION_STATUS_META[rec.status]?.label ?? rec.status,
          updatedAt,
        });
      }
    }
  }
  const bottleneckList = signatureBottlenecks(currentSteps);
  const alerts = [
    ...riskAlertsList,
    ...financialAlertsList,
    ...reportAlertsList,
    ...stalledAlerts(stalled),
    ...budgetAlerts(monitored).filter((a) => a.orgId && orgsScoped.some((o) => o.id === a.orgId)),
    ...(full ? bottleneckAlerts(bottleneckList) : []),
  ].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const priority = prioritySummary(alerts);

  const realEval = evaluateStats(evaluations);
  const dataIssues = dataQualityChecks(orgsScoped, ay);

  // ---- Matrix rows ---------------------------------------------------------------
  const matrixRows: MatrixRow[] = orgsScoped.map((o) => {
    const rec = recOf(o);
    const recLabel = rec
      ? RECOGNITION_STATUS_META[rec.status]?.label ?? rec.status
      : SATISFIED.some((s) => o.recognitions.some((x) => x.status === s && x.academicYear < ay))
        ? "Recognized (prior)"
        : "No application";
    const recTone = (() => {
      if (!rec) return SATISFIED.some((s) => o.recognitions.some((x) => x.status === s && x.academicYear < ay)) ? ("success" satisfies MatrixTone) : ("neutral" as MatrixTone);
      return (RECOGNITION_STATUS_META[rec.status]?.tone ?? "neutral") as MatrixTone;
    })();
    const items = checklistByOrg.get(o.id) ?? [];
    const mon = monitored.find((m) => m.id === o.id)!;
    const risk = risks.find((r) => r.orgId === o.id);
    const fin = financialByOrg.get(o.id) ?? "PENDING";
    const deadlineAt = deadlines
      .filter((d) => d.academicYear === ay && deadlineAppliesLite(d, o, collegeIdByOrg[o.id]))
      .map((d) => d.dueDate.getTime())
      .sort((a, b) => a - b)[0];
    return {
      orgId: o.id,
      name: o.name,
      acronym: o.acronym,
      college: o.collegeName,
      recognition: recLabel,
      recognitionTone: recTone,
      met: items.filter((i) => i.met).length,
      total: items.length,
      financial: FIN_META[fin].label,
      financialTone: FIN_META[fin].tone,
      completion: activityCompletionPct(mon.planned, mon.completed),
      completionLabel: `${mon.completed}/${mon.planned} done`,
      risk: risk ? (risk.level === "AT_RISK" ? "At Risk" : "Due Soon") : null,
      riskTone: risk ? (risk.level === "AT_RISK" ? "danger" : "warning") : "neutral",
      deadlineIn: deadlineAt != null ? Math.max(0, Math.ceil((deadlineAt - now.getTime()) / 86_400_000)) : null,
    };
  });

  // ---- Diagnostic panels ----------------------------------------------------------
  const workflowDelays = diagnoseWorkflow(events);
  const activeOrgCount = Math.max(1, orgsScoped.filter((o) => o.status === "ACTIVE").length);
  const missed = [...checklistByOrg.entries()].flatMap(([, items]) => items.filter((i) => !i.met));
  const missedByKey = new Map<string, number>();
  for (const m of missed) missedByKey.set(m.label, (missedByKey.get(m.label) ?? 0) + 1);
  const missedRows = [...missedByKey.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const trends = {
    m: memberRows.map((r) => ({ label: shortAY(r.academicYear), value: r._count._all })).sort((a, b) => a.label.localeCompare(b.label)),
    recs: (() => {
      const by = new Map<string, number>();
      for (const o of orgs) for (const r of o.recognitions) if (SATISFIED.includes(r.status)) by.set(r.academicYear, (by.get(r.academicYear) ?? 0) + 1);
      return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([y, v]) => ({ label: shortAY(y), value: v }));
    })(),
    acts: activityTrend(orgs).map((r) => ({ label: r.label, value: r.planned })),
    impl: activityCompleteTrend(orgs),
  };

  const exportParams = new URLSearchParams();
  for (const k of ["ay", "org", "college", "type", "rec"] as const) {
    const v = toStr(sp[k]);
    if (v) exportParams.set(k, v);
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        description={
          full
            ? `Five-layer compliance monitoring — descriptive, diagnostic, trend, rule-based alerts, rule-based recommendations · AY ${ay}`
            : `Your scope: compliance monitoring for the organizations you can access · AY ${ay}`
        }
        breadcrumb={[{ label: "Analytics" }]}
        actions={full ? <ExportAnalyticsLink params={exportParams.toString()} /> : undefined}
      />

      <AnalyticsFilters
        options={{
          years: years.map((y) => ({ value: y, label: shortAY(y) })),
          defaultAY: currentAcademicYear(),
          orgs: orgsScoped.map((o) => ({ id: o.id, label: o.acronym ?? o.name })),
          colleges: collegeOpts.map((c) => c.name),
          types: ["MOTHER", "CHILD", "INDEPENDENT"],
          recStatuses: [
            { value: "NONE", label: "No application" },
            ...Object.entries(RECOGNITION_STATUS_META).map(([k, v]) => ({ value: k, label: v.label })),
          ],
        }}
      />

      {orgsScoped.length === 0 ? (
        <NoData what="No organizations match the current filters for your scope." />
      ) : (
        <>
          <AnalyticsDashboard
            kpis={{
              orgsCount: orgsScoped.length,
              recognized: recognizedCount,
              pending: pendingCount,
              expired: expiredCount,
              renewal: forRenewalCount,
              none: notFiled,
              avgCompliance,
              compDelta,
              activeScoreCount: activeScores.length,
              compTrend,
              finCounts,
              monitored,
            }}
            matrixRows={matrixRows}
            diagnostics={{
              missedRows,
              activeOrgCount,
              workflowDelays,
              full,
              bottleneckList,
            }}
            trends={{ compTrend, compDelta, trends }}
            monitoring={{
              monitored,
              attRates,
              overallAttendance,
              attendanceHighest,
              attendanceLowest,
              origByRate,
              realEval,
              evaluations,
            }}
            alerts={{ alerts, priority }}
            integrity={{ dataIssues, ay }}
          />

          {!full && (
            <p className="mt-6 text-xs text-content-muted">
              Your view is scoped to the organizations you can access ({orgsScoped.length}). OSAS/SOA and Deans see the full campus-wide workspace.
            </p>
          )}
        </>
      )}
    </>
  );
}