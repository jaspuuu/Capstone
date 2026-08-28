import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { scopedOrgWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { currentAcademicYear } from "@/lib/utils";
import {
  compliancePct,
  describeOrg,
  financialCompliance,
  requirementsChecklist,
} from "@/lib/analytics";
import { monitorOrg, attendanceRate } from "@/lib/monitoring";
import { RECOGNITION_STATUS_META } from "@/lib/constants";
import { deadlineAppliesLite } from "@/lib/analytics-ui";
import { PageHeader } from "@/components/ui/page-header";
import { OrgDrilldown } from "@/components/analytics/org-drilldown";

export const metadata: Metadata = { title: "Organization analytics" };

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
  const now = new Date();

  // Phase A: the org row and every relation as independent parallel queries.
  const [core, memberRows, recognitionRows, reportRows, activityRows, deadlineRows] = await Promise.all([
    db.organization.findFirst({
      where: scopedOrgWhere(user, { id }),
      select: {
        id: true,
        name: true,
        acronym: true,
        type: true,
        status: true,
        collegeId: true,
        college: { select: { name: true } },
      },
    }),
    db.organizationMember.findMany({
      where: { organizationId: id, isCurrent: true },
      select: { position: true, status: true },
    }),
    db.recognition.findMany({
      where: { organizationId: id },
      select: { id: true, kind: true, academicYear: true, status: true, interviewStatus: true },
    }),
    db.accomplishmentReport.findMany({
      where: { organizationId: id },
      select: { academicYear: true, status: true },
    }),
    db.activityProposal.findMany({
      where: { organizationId: id },
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
    }),
    db.deadline.findMany({
      where: { isActive: true },
      select: { id: true, name: true, process: true, academicYear: true, dueDate: true, scopeType: true, scopeCollegeId: true },
    }),
  ]);
  if (!core) notFound();

  const recIds = recognitionRows.map((r) => r.id);
  const taggedFiles = await db.attachment.findMany({
    where: { entityType: "Recognition", kind: { not: null }, entityId: { in: recIds } },
    select: { entityId: true, kind: true, createdAt: true },
  });

  const taggedByRec = new Map<string, { kind: string; createdAt: Date }[]>();
  for (const t of taggedFiles) {
    const list = taggedByRec.get(t.entityId) ?? [];
    if (t.kind) list.push({ kind: t.kind, createdAt: t.createdAt });
    taggedByRec.set(t.entityId, list);
  }

  const snapshot = {
    id: core.id,
    name: core.name,
    acronym: core.acronym,
    type: core.type,
    status: core.status,
    collegeName: core.college?.name ?? null,
    members: memberRows,
    recognitions: recognitionRows,
    activities: activityRows.map((a) => ({
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
    reports: reportRows,
    requirementFiles: recognitionRows.flatMap((r) =>
      (taggedByRec.get(r.id) ?? []).map((a) => ({ kind: a.kind as never, academicYear: r.academicYear, createdAt: a.createdAt }))
    ),
  };

  const rec = recognitionRows.find((r) => r.academicYear === ay) ?? null;
  const checklist = requirementsChecklist(snapshot, ay);
  const metCount = checklist.filter((i) => i.met).length;
  const compliance = compliancePct(checklist);
  const desc = describeOrg(snapshot, ay);
  const financial = financialCompliance(snapshot, ay, deadlineRows, core.collegeId, now);

  const mon = monitorOrg(
    { id: core.id, name: core.name, acronym: core.acronym, collegeName: core.college?.name ?? null },
    activityRows.map((a) => ({
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
  );
  const attendance = mon.activities
    .map((a) => attendanceRate(a))
    .filter((r): r is number => r != null);
  const avgAttendance =
    attendance.length > 0 ? Math.round(attendance.reduce((s, x) => s + x, 0) / attendance.length) : null;

  const activeMembers = memberRows.filter((m) => m.status === "ACTIVE" || m.status === "APPROVED").length;
  const inactiveMembers = memberRows.filter((m) => m.status === "INACTIVE").length;
  const officers = memberRows.filter((m) => m.position === "PRESIDENT" || m.position === "SECRETARY").length;

  const applicableDeadlines = deadlineRows
    .filter((d) => d.academicYear === ay)
    .filter((d) => deadlineAppliesLite(d, { type: core.type }, core.collegeId));

  const recMeta = rec ? (RECOGNITION_STATUS_META[rec.status] ?? null) : null;

  return (
    <>
      <PageHeader
        title={core.acronym ?? core.name}
        description={`Organization analytics · AY ${ay === currentAcademicYear() ? ay : `${ay} (selected)`}`}
        breadcrumb={[{ label: "Analytics", href: "/analytics" }, { label: core.acronym ?? core.name }]}
        actions={
          <Link
            href={`/organizations/${core.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-content hover:border-primary hover:text-primary"
          >
            Organization profile <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      />

      <OrgDrilldown
        overview={{
          ay,
          rec,
          recMeta,
          compliance,
          financial,
          officerRatio: desc.officerRatio,
          officers,
          members: memberRows.length,
          activeMembers,
          inactiveMembers,
          metCount,
          checklistTotal: checklist.length,
          avgAttendance,
          attendanceCount: attendance.length,
        }}
        requirements={{ checklist, ay, deadlines: applicableDeadlines }}
        activities={{ mon, avgAttendance }}
      />
    </>
  );
}