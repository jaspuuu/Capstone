import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Award, CalendarCheck, Flag, ListChecks, ShieldAlert, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, scopedOrgWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { currentAcademicYear, formatDate, formatMoney } from "@/lib/utils";
import type { OrgType } from "@/generated/prisma/client";
import {
  activityCompleteTrend,
  activityCompletionPct,
  activityTrend,
  assessRisk,
  bottleneckAlerts,
  budgetAlerts,
  budgetUtilizationPct,
  complianceByYear,
  complianceDelta,
  compliancePct,
  dataQualityChecks,
  diagnoseWorkflow,
  evaluateStats,
  financialAlerts,
  financialCompliance,
  pctChange,
  prioritySummary,
  PRIORITY_META,
  reportAlerts,
  riskAlerts,
  requirementsChecklist,
  shortAY,
  signatureBottlenecks,
  stalledAlerts,
} from "@/lib/analytics";
import { attendanceRate, monitorOrg } from "@/lib/monitoring";
import { RECOGNITION_WORKFLOW, inFlightStatuses } from "@/lib/workflow";
import { RECOGNITION_STATUS_META } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { BarChart, LineChart, DonutChart } from "@/components/ui/charts";
import {
  ExportAnalyticsLink,
  HBar,
  KpiCard,
  NoData,
  SectionCard,
} from "@/components/analytics/analytics-parts";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { ComplianceMatrix, type MatrixRow, type MatrixTone } from "@/components/analytics/matrix-table";

export const metadata: Metadata = { title: "Analytics" };

const SATISFIED = ["APPROVED", "RECOGNIZED"];

const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, INFO: 3 } as const;

const FIN_META: Record<string, { tone: "success" | "danger" | "warning"; label: string }> = {
  SUBMITTED: { tone: "success", label: "Submitted" },
  OVERDUE: { tone: "danger", label: "Overdue" },
  PENDING: { tone: "warning", label: "Unsubmitted" },
};

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

  // ---- Scoped organizational analytics for every other role.
  const filterWhere = {
    ...(toStr(sp.org) ? { id: toStr(sp.org) } : {}),
    ...(toStr(sp.type) ? { type: toStr(sp.type) as OrgType } : {}),
    ...(toStr(sp.college) ? { college: { name: toStr(sp.college) } } : {}),
  };

  const orgsRaw = await db.organization.findMany({
    where: scopedOrgWhere(user, filterWhere),
    select: {
      id: true,
      name: true,
      acronym: true,
      type: true,
      status: true,
      applicationStatus: true,
      collegeId: true,
      college: { select: { id: true, name: true } },
      members: { where: { isCurrent: true }, select: { position: true, status: true } },
      recognitions: { select: { id: true, kind: true, academicYear: true, status: true, updatedAt: true, submittedAt: true } },
      reports: { select: { academicYear: true, status: true } },
      activities: {
        select: {
          id: true,
          academicYear: true,
          status: true,
          phase: true,
          scope: true,
          startAt: true,
          endAt: true,
          expectedParticipants: true,
          estimatedBudget: true,
          _count: { select: { attendanceRecords: true } },
          report: { select: { status: true, actualParticipants: true, actualBudget: true } },
        },
      },
    },
  });
  const recIds = orgsRaw.flatMap((o) => o.recognitions.map((r) => r.id));
  const orgIds = orgsRaw.map((o) => o.id);
  const collegeIdByOrg = Object.fromEntries(orgsRaw.map((o) => [o.id, o.collegeId]));
  const collegeOpts = [...new Map(orgsRaw.map((o) => [o.college.id, o.college])).values()];

  const [taggedFiles, deadlines, memberRows, events, currentSteps, evaluations] = await Promise.all([
    db.attachment.findMany({
      where: { entityType: "Recognition", kind: { not: null }, entityId: { in: recIds } },
      select: { entityId: true, kind: true, createdAt: true },
    }),
    db.deadline.findMany({
      where: { isActive: true },
      select: { id: true, name: true, process: true, academicYear: true, dueDate: true, scopeType: true, scopeCollegeId: true },
    }),
    db.organizationMember.groupBy({
      by: ["academicYear"],
      _count: { _all: true },
      where: { organizationId: { in: orgIds }, isCurrent: true },
    }),
    db.recognitionEvent.findMany({
      where: { recognition: { organizationId: { in: orgIds } } },
      select: { recognitionId: true, action: true, createdAt: true },
    }),
    db.signatureStep.findMany({
      where: { status: "CURRENT", route: { entityType: "SF" } },
      select: { role: true },
    }),
    db.activityEvaluation.findMany({
      where: { activity: { organizationId: { in: orgIds }, academicYear: ay } },
      select: {
        relevance: true,
        impact: true,
        efficiency: true,
        sustainability: true,
        activity: { select: { organizationId: true, title: true } },
      },
    }),
  ]);
  const taggedByRec = new Map<string, { kind: string; createdAt: Date }[]>();
  for (const t of taggedFiles) {
    if (!t.kind) continue;
    const list = taggedByRec.get(t.entityId) ?? [];
    list.push({ kind: t.kind, createdAt: t.createdAt });
    taggedByRec.set(t.entityId, list);
  }

  const orgs = orgsRaw.map((o) => ({
    id: o.id,
    name: o.name,
    acronym: o.acronym,
    type: o.type,
    status: o.status,
    collegeName: o.college.name,
    members: o.members,
    recognitions: o.recognitions,
    reports: o.reports,
    activities: o.activities.map((a) => ({
      academicYear: a.academicYear,
      status: a.status,
      phase: a.phase,
      scope: a.scope,
      id: a.id,
      startAt: a.startAt,
      endAt: a.endAt,
      expectedParticipants: a.expectedParticipants,
      estimatedBudget: a.estimatedBudget,
      attendanceCount: a._count.attendanceRecords,
      reportStatus: a.report?.status ?? null,
      actualParticipants: a.report?.actualParticipants ?? null,
      actualBudget: a.report?.actualBudget ?? null,
    })),
    requirementFiles: o.recognitions.flatMap((r) =>
      (taggedByRec.get(r.id) ?? []).map((a) => ({ kind: a.kind as never, academicYear: r.academicYear, createdAt: a.createdAt }))
    ),
  }));

  // Recognition-status filter (post-query: a status like NONE is not a Prisma field).
  const recFilter = toStr(sp.rec);
  const orgsScoped = recFilter
    ? orgs.filter((o) => {
        const rec = o.recognitions.find((r) => r.academicYear === ay);
        return recFilter === "NONE" ? !rec : rec?.status === recFilter;
      })
    : orgs;

  const years = [
    ...new Set(
      [...orgs.flatMap((o) => o.recognitions.map((r) => r.academicYear)), ay, currentAcademicYear()].sort()
    ),
  ];

  // ---- Layer 1: descriptive aggregates ----------------------------------------
  const recOf = (o: typeof orgsScoped[number]) => o.recognitions.find((r) => r.academicYear === ay);
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
          id: a.id!,
          title: "",
          status: a.status,
          phase: a.phase,
          scope: a.scope,
          venue: null,
          startAt: a.startAt!,
          endAt: a.endAt!,
          estimatedBudget: a.estimatedBudget ?? null,
          actualBudget: a.actualBudget ?? null,
          expectedParticipants: a.expectedParticipants ?? null,
          actualParticipants: a.actualParticipants ?? null,
          attendanceCount: a.attendanceCount ?? 0,
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

  const budgetPlannedTotal = monitored.reduce((s, m) => s + m.budgetPlanned, 0);
  const budgetActualTotal = monitored.reduce((s, m) => s + m.budgetActual, 0);
  const budgetUtil = budgetUtilizationPct(budgetPlannedTotal, budgetActualTotal);
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

  const trends = (() => {
    const m = memberRows.map((r) => ({ label: shortAY(r.academicYear), value: r._count._all })).sort((a, b) => a.label.localeCompare(b.label));
    const recs = (() => {
      const by = new Map<string, number>();
      for (const o of orgs) for (const r of o.recognitions) if (SATISFIED.includes(r.status)) by.set(r.academicYear, (by.get(r.academicYear) ?? 0) + 1);
      return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([y, v]) => ({ label: shortAY(y), value: v }));
    })();
    const acts = activityTrend(orgs).map((r) => ({ label: r.label, value: r.planned }));
    const impl = activityCompleteTrend(orgs);
    return { m, recs, acts, impl };
  })();

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
        actions={
          full ? (
            <ExportAnalyticsLink params={exportParams.toString()} />
          ) : undefined
        }
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
          {/* Executive overview: four focused KPIs */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Organizations" value={`${orgsScoped.length}`} hint={`${recognizedCount} recognized · ${pendingCount} pending · ${expiredCount} expired · ${forRenewalCount} for renewal · ${notFiled} no application`}>
              <DonutChart
                data={[
                  { label: "Recognized", value: recognizedCount, tone: "success" },
                  { label: "Pending", value: pendingCount, tone: "warning" },
                  { label: "Expired", value: expiredCount, tone: "neutral" },
                  { label: "For renewal", value: forRenewalCount, tone: "info" },
                  { label: "No application", value: notFiled, tone: "muted" },
                ]}
                ariaLabel="Organizations by recognition state"
              />
            </KpiCard>
            <KpiCard
              label="Accreditation compliance"
              value={avgCompliance != null ? `${avgCompliance}%` : "—"}
              delta={compDelta}
              hint={`average of the 7-item SF-001 checklist across ${activeScores.length} active organizations`}
            >
              {compTrend.length > 0 ? (
                <LineChart data={compTrend} ariaLabel="Average accreditation compliance per academic year" />
              ) : (
                <NoData what="Not enough completed records to compute a compliance trend for the selected period." />
              )}
            </KpiCard>
            <KpiCard label="Financial compliance" value={`${finCounts.SUBMITTED}`} valueHint="submitted" hint="CAPS scope: submission status only">
              <DonutChart
                data={[
                  { label: "Submitted", value: finCounts.SUBMITTED, tone: "success" },
                  { label: "Overdue", value: finCounts.OVERDUE, tone: "danger" },
                  { label: "Unsubmitted", value: finCounts.PENDING, tone: "warning" },
                ]}
                ariaLabel="Financial compliance status distribution"
              />
            </KpiCard>
            <KpiCard label="Activity completion" value={activityPlannedTotal(monitored) > 0 ? `${overallActivityCompletion(monitored)}%` : "—"} valueHint="of planned" hint="completed activities ÷ planned (— means none planned yet)">
              <DonutChart
                data={activityStatusSlices(monitored)}
                ariaLabel="Activities by implementation state"
              />
            </KpiCard>
          </div>

          {/* Compliance matrix (sortable, click-through) */}
          <SectionCard
            className="mb-6"
            title="Organization compliance matrix"
            description="Recognition · requirements · financial · activities per organization. Click any organization for its full analytics."
          >
            <ComplianceMatrix rows={matrixRows} />
          </SectionCard>

          {/* Diagnostic insights */}
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="Most frequently missed requirements" description="SF-001 items still missing across active organizations in your scope." />
              <CardContent className="space-y-4">
                {missedRows.length > 0 ? (
                  missedRows.map((r) => (
                    <HBar
                      key={r.label}
                      label={r.label}
                      percent={Math.round((r.value / activeOrgCount) * 100)}
                      rightText={`${r.value}/${activeOrgCount} orgs`}
                    />
                  ))
                ) : (
                  <NoData what="No checklist items are currently missing." />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader title="Workflow stage delays" description="Average calendar days between recorded milestones on accreditation applications (only configured stages)." />
              <CardContent>
                {workflowDelays.length > 0 ? (
                  <dl className="space-y-3">
                    {workflowDelays.map((s) => (
                      <div key={s.stage} className="flex items-center justify-between gap-2 rounded-xl border border-line px-4 py-3">
                        <dt className="text-sm font-medium text-content-secondary">{s.stage}</dt>
                        <dd className="font-display text-lg font-bold text-content tabular-nums">
                          {s.days}
                          <span className="ml-1 text-xs font-medium text-content-secondary">days</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <NoData what="No recognition workflows have recorded timestamps in this scope yet." />
                )}
                {!full && (
                  <p className="mt-3 text-xs text-content-muted">Shown for your scope.</p>
                )}
              </CardContent>
            </Card>
            {full && (
              <Card>
                <CardHeader title="Document bottlenecks" description="Signature-routed forms currently awaiting action, by signatory role." />
                <CardContent>
                  {bottleneckList.length > 0 ? (
                    <dl className="space-y-3">
                      {bottleneckList.map((b) => (
                        <div key={b.role} className="flex items-center justify-between gap-2 rounded-xl border border-line px-4 py-3">
                          <dt className="text-sm font-medium text-content-secondary">{b.label}</dt>
                          <dd className="font-display text-lg font-bold text-content tabular-nums">{b.count}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <NoData what="No documents are currently parked at a signatory." />
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Trend analytics */}
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-4">
            <Card className="lg:col-span-2">
              <CardHeader title="Accreditation compliance trend" description={deltaHint(compDelta)} />
              <CardContent>
                {compTrend.length > 0 ? (
                  <LineChart data={compTrend} ariaLabel="Average compliance percentage per academic year" />
                ) : (
                  <NoData what="Not enough completed requirement records across cycles." />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader title="Membership per cycle" description={deltaHint(pctChange(trends.m), "%")} />
              <CardContent>
                {trends.m.length > 0 ? (
                  <BarChart data={trends.m} ariaLabel="Total members per academic year" />
                ) : (
                  <NoData what="No membership data recorded yet." />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader title="Activities & implementation" description="Planned activities and implementation rate per cycle." />
              <CardContent className="space-y-4">
                {trends.acts.length > 0 ? (
                  <BarChart data={trends.acts} ariaLabel="Activity proposals filed per academic year" />
                ) : (
                  <NoData what="No activity proposals recorded yet." />
                )}
                {trends.impl.length > 0 && (
                  <LineChart data={trends.impl} ariaLabel="Activity implementation rate per academic year" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Attendance + M&E */}
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Attendance analytics" description="From recorded attendance — registered vs actual, not a score." />
              <CardContent>
                {attRates.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-3">
                      <StatCard label="Average attendance" value={`${overallAttendance}%`} icon={Users} iconTone="info" />
                      <StatCard label="Highest" value={attendanceHighest ? `${attendanceHighest.value}% (${attendanceHighest.label})` : "—"} icon={Award} iconTone="success" />
                      <StatCard label="Lowest" value={attendanceLowest ? `${attendanceLowest.value}% (${attendanceLowest.label})` : "—"} icon={Flag} iconTone="warning" />
                    </div>
                    <BarChart data={origByRate.slice(0, 8)} ariaLabel="Average attendance by organization" />
                  </div>
                ) : (
                  <NoData what="No recorded attendance data in the selected scope yet." />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader title="Monitoring & evaluation" description={realEval.count > 0 ? "Rubric-based evaluations entered by officers (1–5 scale, 5 = best)." : "Integrated evaluation indicators — counts and attendance, no invented rating."} />
              <CardContent>
                {realEval.count > 0 || evaluationSummary(monitored, overallAttendance).loaded ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <StatCard label="Orgs evaluated" value={realEval.count > 0 ? new Set(evaluations.map((e) => e.activity.organizationId)).size : evaluationSummary(monitored, overallAttendance).orgs} icon={ListChecks} />
                      <StatCard label="Activities evaluated" value={realEval.count > 0 ? realEval.count : evaluationSummary(monitored, overallAttendance).activities} icon={Activity} iconTone="info" />
                      <StatCard
                        label="Average evaluation"
                        value={realEval.avgPct != null ? `${realEval.avgPct}%` : evaluationSummary(monitored, overallAttendance).avg != null ? `${evaluationSummary(monitored, overallAttendance).avg}%` : "—"}
                        icon={ShieldAlert}
                        iconTone="warning"
                        hint={realEval.avgPct != null ? "officer-entered rubric" : "attendance capture"}
                      />
                    </div>
                    {realEval.count > 0 ? (
                      <div className="mt-4 space-y-3">
                        {realEval.dims.map((d) => (
                          <HBar key={d.label} label={d.label} percent={d.pct} rightText={`avg ${d.avg}/5`} />
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-content-secondary">
                        No rubric evaluations entered yet — {evalHint(overallAttendance)}. The system records counts, percentages, budget and attendance; no grade scale is invented.
                      </p>
                    )}
                  </>
                ) : (
                  <NoData what="No activities with recorded evaluation indicators in this scope yet." />
                )}
                {budgetPlannedTotal > 0 && (
                  <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-line px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-content">Budget utilization</p>
                      <p className="text-xs text-content-secondary">
                        {formatMoney(budgetActualTotal)} spent of {formatMoney(budgetPlannedTotal)} approved
                      </p>
                    </div>
                    <span className={`font-display text-lg font-bold tabular-nums ${budgetUtil != null && budgetUtil > 105 ? "text-red-600" : "text-content"}`}>
                      {budgetUtil != null ? `${budgetUtil}%` : "—"}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Rule-based alerts + recommendations */}
          <SectionCard
            title="Alerts & recommendations"
            description="Every item is emitted by an explicit fixed rule; the reason each alert exists is shown alongside the recommended administrative action."
          >
            {alerts.length === 0 ? (
              <Alert tone="success" title="No active alerts">
                No organization currently meets any configured rule threshold in your scope.
              </Alert>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  {(["CRITICAL", "HIGH", "MEDIUM", "INFO"] as const).map((p) => (
                    <Badge key={p} tone={PRIORITY_META[p].tone}>
                      {PRIORITY_META[p].label} {priority[p]}
                    </Badge>
                  ))}
                </div>
                <ul className="space-y-3">
                  {alerts.map((a) => (
                    <li key={a.id} className="rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="size-4 text-content-muted" aria-hidden />
                          <p className="text-sm font-bold text-content">{a.title}</p>
                        </div>
                        <Badge tone={PRIORITY_META[a.priority].tone}>{PRIORITY_META[a.priority].label}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-content-secondary">{a.detail}</p>
                      <p className="mt-2 rounded-lg bg-primary-light px-3 py-2 text-xs font-semibold text-primary">Why: {a.why}</p>
                      {a.href && (
                        <div className="mt-2">
                          <Link href={a.href} className="text-xs font-semibold text-primary hover:underline">
                            View details →
                          </Link>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SectionCard>

          {/* Data-quality integrity flags */}
          <SectionCard
            className="mt-6"
            title={`Data integrity (${dataIssues.length})`}
            description="Rule-based flags for inconsistent or orphaned records in the current scope — fixing these cleans the analytics inputs."
          >
            {dataIssues.length === 0 ? (
              <Alert tone="success" title="No data-quality flags">
                No active organization in your scope triggers an integrity rule for {ay}.
              </Alert>
            ) : (
              <ul className="space-y-3">
                {dataIssues.map((d) => (
                  <li key={d.id} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-content">{d.title}</p>
                      <Badge tone={d.severity === "HIGH" ? "danger" : d.severity === "MEDIUM" ? "warning" : "neutral"}>
                        {d.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-content-secondary">{d.detail}</p>
                    <p className="mt-2 rounded-lg bg-primary-light px-3 py-2 text-xs font-semibold text-primary">Rule: {d.why}</p>
                    {d.href && (
                      <div className="mt-2">
                        <Link href={d.href} className="text-xs font-semibold text-primary hover:underline">
                          Inspect →
                        </Link>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

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

// ---- helpers --------------------------------------------------------------

function deltaHint(d: number | null, unit = "pts"): string | undefined {
  if (d == null) return undefined;
  return d > 0 ? `up ${d}${unit} from the previous cycle` : d < 0 ? `down ${Math.abs(d)}${unit} vs the previous cycle` : "flat vs the previous cycle";
}

function evalHint(avg: number | null): string {
  return avg != null ? `fallback attendance capture averages ${avg}%` : "no attendance data either";
}

function deadlineAppliesLite(d: { scopeType: string; scopeCollegeId: string | null }, o: { type: string }, collegeId: string | null): boolean {
  if (d.scopeCollegeId && d.scopeCollegeId !== collegeId) return false;
  if (d.scopeType === "MOTHER") return o.type === "MOTHER";
  if (d.scopeType === "CHILD") return o.type === "CHILD";
  if (d.scopeType === "INDEPENDENT") return o.type === "INDEPENDENT";
  return true;
}

function overallActivityCompletion(monitored: { completed: number; planned: number }[]): number {
  const planned = monitored.reduce((s, m) => s + m.planned, 0);
  const completed = monitored.reduce((s, m) => s + m.completed, 0);
  return planned > 0 ? Math.round((completed / planned) * 100) : 0;
}

function activityPlannedTotal(monitored: { planned: number }[]): number {
  return monitored.reduce((s, m) => s + m.planned, 0);
}

function activityStatusSlices(monitored: {
  planned: number;
  completed: number;
  approved: number;
  endedWithoutReport: { id: string }[];
}[]): { label: string; value: number; tone: "success" | "info" | "warning" | "danger" }[] {
  const completed = monitored.reduce((s, m) => s + m.completed, 0);
  const ongoing = monitored.reduce((s, m) => s + Math.max(0, m.approved - m.completed), 0);
  const pending = monitored.reduce((s, m) => s + Math.max(0, m.planned - m.approved - m.completed), 0);
  const overdue = monitored.reduce((s, m) => s + m.endedWithoutReport.length, 0);
  return [
    { label: "Completed", value: completed, tone: "success" },
    { label: "Ongoing", value: ongoing, tone: "info" },
    { label: "Pending approval", value: pending, tone: "warning" },
    { label: "Overdue", value: overdue, tone: "danger" },
  ];
}

function evaluationSummary(monitored: { completed: number; endedWithoutReport: unknown[] }[], avg: number | null) {
  const orgs = monitored.length;
  const activities = monitored.reduce((s, m) => s + m.completed + m.endedWithoutReport.length, 0);
  return { loaded: activities > 0, orgs, activities, avg };
}