import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileCheck, Flag, Users, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { scopedOrgWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { currentAcademicYear, formatDate } from "@/lib/utils";
import {
  compliancePct,
  describeOrg,
  financialCompliance,
  requirementsChecklist,
  requirementLabel,
} from "@/lib/analytics";
import { monitorOrg, attendanceRate } from "@/lib/monitoring";
import { RECOGNITION_STATUS_META } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { ProportionBar } from "@/components/ui/charts";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
import { NoData } from "@/components/analytics/analytics-parts";

export const metadata: Metadata = { title: "Organization analytics" };

const FIN_META: Record<string, { tone: "success" | "danger" | "warning"; label: string }> = {
  SUBMITTED: { tone: "success", label: "Submitted" },
  OVERDUE: { tone: "danger", label: "Overdue" },
  PENDING: { tone: "warning", label: "Unsubmitted" },
};

export default async function OrgAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ay?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { ay: ayParam } = await searchParams;
  const ay = ayParam || currentAcademicYear();

  const org = await db.organization.findFirst({
    where: scopedOrgWhere(user, { id }),
    select: {
      id: true,
      name: true,
      acronym: true,
      type: true,
      status: true,
      collegeId: true,
      college: { select: { name: true } },
      members: { where: { isCurrent: true }, select: { position: true, status: true } },
      recognitions: { select: { id: true, kind: true, academicYear: true, status: true, interviewStatus: true } },
      reports: { select: { academicYear: true, status: true } },
      activities: {
        select: {
          id: true,
          title: true,
          academicYear: true,
          status: true,
          phase: true,
          scope: true,
          venue: true,
          startAt: true,
          endAt: true,
          estimatedBudget: true,
          expectedParticipants: true,
          _count: { select: { attendanceRecords: true } },
          report: { select: { status: true, actualParticipants: true, actualBudget: true } },
        },
      },
    },
  });
  if (!org) notFound();

  const recIds = org.recognitions.map((r) => r.id);
  const [taggedFiles, deadlines] = await Promise.all([
    db.attachment.findMany({
      where: { entityType: "Recognition", kind: { not: null }, entityId: { in: recIds } },
      select: { entityId: true, kind: true, createdAt: true },
    }),
    db.deadline.findMany({ where: { isActive: true }, select: { id: true, name: true, process: true, academicYear: true, dueDate: true, scopeType: true, scopeCollegeId: true } }),
  ]);
  const taggedByRec = new Map<string, { kind: string; createdAt: Date }[]>();
  for (const t of taggedFiles) {
    const list = taggedByRec.get(t.entityId) ?? [];
    if (t.kind) list.push({ kind: t.kind, createdAt: t.createdAt });
    taggedByRec.set(t.entityId, list);
  }

  const snapshot = {
    id: org.id,
    name: org.name,
    acronym: org.acronym,
    type: org.type,
    status: org.status,
    collegeName: org.college?.name ?? null,
    members: org.members,
    recognitions: org.recognitions,
    activities: org.activities.map((a) => ({
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
    reports: org.reports,
    requirementFiles: org.recognitions.flatMap((r) =>
      (taggedByRec.get(r.id) ?? []).map((a) => ({ kind: a.kind as never, academicYear: r.academicYear, createdAt: a.createdAt }))
    ),
  };

  const rec = org.recognitions.find((r) => r.academicYear === ay);
  const checklist = requirementsChecklist(snapshot, ay);
  const metCount = checklist.filter((i) => i.met).length;
  const compliance = compliancePct(checklist);
  const desc = describeOrg(snapshot, ay);
  const financial = financialCompliance(snapshot, ay, deadlines, org.collegeId);
  const mon = monitorOrg(
    { id: org.id, name: org.name, acronym: org.acronym, collegeName: org.college?.name ?? null },
    org.activities.map((a) => ({
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
    new Date()
  );
  const attendance = mon.activities
    .map((a) => attendanceRate(a))
    .filter((r): r is number => r != null);
  const avgAttendance =
    attendance.length > 0 ? Math.round(attendance.reduce((s, x) => s + x, 0) / attendance.length) : null;

  const activeMembers = org.members.filter((m) => m.status === "ACTIVE" || m.status === "APPROVED").length;
  const inactiveMembers = org.members.filter((m) => m.status === "INACTIVE").length;
  const officers = org.members.filter((m) => m.position === "PRESIDENT" || m.position === "SECRETARY").length;

  const applicableDeadlines = deadlines
    .filter((d) => d.academicYear === ay)
    .filter((d) => {
      if (d.scopeCollegeId && d.scopeCollegeId !== org.collegeId) return false;
      if (d.scopeType === "ALL") return true;
      if (d.scopeType === "MOTHER") return org.type === "MOTHER";
      if (d.scopeType === "CHILD") return org.type === "CHILD";
      if (d.scopeType === "INDEPENDENT") return org.type === "INDEPENDENT";
      return true;
    });

  const recMeta = rec ? RECOGNITION_STATUS_META[rec.status] : null;

  return (
    <>
      <PageHeader
        title={org.acronym ?? org.name}
        description={`Organization analytics · AY ${ay === currentAcademicYear() ? ay : `${ay} (selected)`}`}
        breadcrumb={[{ label: "Analytics", href: "/analytics" }, { label: org.acronym ?? org.name }]}
        actions={
          <Link
            href={`/organizations/${org.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-content hover:border-primary hover:text-primary"
          >
            Organization profile <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Recognition" />
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              {rec ? (
                <>
                  <Badge tone={recMeta?.tone ?? "neutral"}>{recMeta?.label ?? rec.status}</Badge>
                  <span className="text-xs text-content-secondary">
                    {rec.kind === "RENEWAL" ? "Renewal" : "Initial recognition"} · Cycle {rec.academicYear}
                  </span>
                </>
              ) : (
                <>
                  <Badge tone="neutral">No application this cycle</Badge>
                  <span className="text-xs text-content-secondary">Cycle {ay}</span>
                </>
              )}
            </div>
            <ProportionBar value={compliance} total={100} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Financial compliance" />
          <CardContent>
            <Badge tone={FIN_META[financial].tone}>{FIN_META[financial].label}</Badge>
            <p className="mt-2 text-xs text-content-secondary">
              CAPS scope: submitted / overdue / unsubmitted — not a treasury ledger.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Officer ratio" />
          <CardContent>
            <p className="font-display text-2xl font-bold text-content">
              {desc.memberCount > 0 ? `1 : ${desc.officerRatio.replace("1 : ", "")}` : "—"}
            </p>
            <p className="mt-1 text-xs text-content-secondary">
              {officers} officer{officers === 1 ? "" : "s"} · {desc.memberCount} members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Attendance" />
          <CardContent>
            <p className="font-display text-2xl font-bold text-content">{avgAttendance != null ? `${avgAttendance}%` : "—"}</p>
            <p className="mt-1 text-xs text-content-secondary">
              {attendance.length > 0
                ? `average capture across ${attendance.length} recorded activit${attendance.length === 1 ? "y" : "ies"}`
                : "no recorded attendance data yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Requirements met" value={`${metCount} / ${checklist.length}`} icon={FileCheck} iconTone="success" hint="SF-001 accreditation checklist" />
        <StatCard label="Members" value={`${org.members.length} (${activeMembers} active · ${inactiveMembers} inactive)`} icon={Users} iconTone="info" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Requirement compliance" description="Which SF-001 items are still outstanding this cycle." />
          <CardContent className="space-y-3">
            {checklist.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-content">{requirementLabel(item.key)}</span>
                <Badge tone={item.met ? "success" : item.status === "RETURNED" ? "danger" : "neutral"}>
                  {item.met ? "Submitted / Approved" : item.status === "REQUIRED" ? "Missing" : item.status}
                </Badge>
              </div>
            ))}
            <p className="pt-1 text-xs text-content-secondary">
              “Compliant” here means the tracked document actually exists — not merely that an application was filed.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Applicable deadlines" description={`Deadlines applying to this organization for AY ${ay}.`} />
          <CardContent>
            {applicableDeadlines.length > 0 ? (
              <ul className="space-y-2">
                {applicableDeadlines.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-content">{d.name}</span>
                    <span className="shrink-0 text-xs text-content-secondary">{formatDate(d.dueDate)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <NoData what="No active deadlines apply to this organization for the selected academic year." />
            )}
          </CardContent>
        </Card>
      </div>

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
              <StatCard label="Budget utilized" value={`${mon.budgetPlanned > 0 ? Math.round((mon.budgetActual / mon.budgetPlanned) * 100) : 0}%`} icon={Wallet} iconTone="warning" />
              <StatCard label="Avg attendance" value={avgAttendance != null ? `${avgAttendance}%` : "—"} icon={Users} iconTone="info" />
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
    </>
  );
}