import { cache } from "react";
import { cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { scopedOrgWhere } from "@/lib/auth/rbac";
import type { AuthUser } from "@/lib/auth/session";
import type { DeadlineLite, OrgSnapshot } from "@/lib/analytics";
import type { AttachmentKind } from "@/lib/attachments";
import type {
  ActivityScope,
  OrgType,
  RecognitionKind,
  RecognitionStatus,
  ReportStatus,
  SignatoryRole,
} from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Single source of truth for analytics data. One loader serves both the
// analytics page and the CSV export, so they can never drift apart. The org
// query is split into parallel relation queries (they were previously
// sequential relation-includes inside one findMany), and results are assembled
// in memory.
// ---------------------------------------------------------------------------

export type AnalyticsActivity = {
  academicYear: string;
  status: string;
  phase: string | null;
  scope: ActivityScope;
  id: string;
  startAt: Date;
  endAt: Date;
  expectedParticipants: number | null;
  estimatedBudget: number | null;
  attendanceCount: number;
  reportStatus: string | null;
  actualParticipants: number | null;
  actualBudget: number | null;
};

export type AnalyticsOrg = {
  id: string;
  name: string;
  acronym: string | null;
  type: OrgType;
  status: string;
  collegeId: string | null;
  collegeName: string;
  members: { position: string; status: string }[];
  recognitions: {
    id: string;
    kind: RecognitionKind;
    academicYear: string;
    status: RecognitionStatus;
    updatedAt: Date;
    submittedAt: Date | null;
  }[];
  reports: { academicYear: string; status: ReportStatus }[];
  activities: {
    academicYear: string;
    status: string;
    phase: string | null;
    scope: ActivityScope;
    id: string;
    startAt: Date;
    endAt: Date;
    expectedParticipants: number | null;
    estimatedBudget: number | null;
    attendanceCount: number;
    reportStatus: string | null;
    actualParticipants: number | null;
    actualBudget: number | null;
  }[];
  requirementFiles: { kind: AttachmentKind; academicYear: string; createdAt: Date }[];
};

/** AnalyticsOrg is a superset of OrgSnapshot, so analytics functions accept it as-is. */
export type { OrgSnapshot };

export type AnalyticsSnapshot = {
  ay: string;
  orgs: AnalyticsOrg[];
  allOrgs: AnalyticsOrg[];
  deadlines: DeadlineLite[];
  memberRows: { academicYear: string; _count: { _all: number } }[];
  events: { recognitionId: string; action: string; createdAt: Date }[];
  currentSteps: { role: SignatoryRole }[];
  evaluations: {
    relevance: number;
    impact: number;
    efficiency: number;
    sustainability: number;
    activity: { organizationId: string; title: string };
  }[];
  collegeIdByOrg: Record<string, string | null>;
  collegeOpts: { id: string; name: string }[];
};

export type AnalyticsFilters = {
  ay: string;
  org?: string;
  type?: string;
  college?: string;
  rec?: string;
};

export async function buildAnalyticsSnapshot(
  user: AuthUser,
  filters: AnalyticsFilters
): Promise<AnalyticsSnapshot> {
  "use cache";
  // Cross-request: stale 5m, background revalidate 1m, hard expire 1h.
  cacheLife("minutes");

  const { ay } = filters;
  const filterWhere = {
    ...(filters.org ? { id: filters.org } : {}),
    ...(filters.type ? { type: filters.type as OrgType } : {}),
    ...(filters.college ? { college: { name: filters.college } } : {}),
  };
  const scope = scopedOrgWhere(user, filterWhere);

  // Phase A: core org rows + every relation as an independent parallel query.
  const [orgRows, memberRows, recognitionRows, reportRows, activityRows] = await Promise.all([
    db.organization.findMany({
      where: scope,
      select: {
        id: true,
        name: true,
        acronym: true,
        type: true,
        status: true,
        collegeId: true,
        college: { select: { id: true, name: true } },
      },
    }),
    db.organizationMember.findMany({
      where: { isCurrent: true, organization: scope },
      select: { organizationId: true, position: true, status: true },
    }),
    db.recognition.findMany({
      where: { organization: scope },
      select: {
        id: true,
        organizationId: true,
        kind: true,
        academicYear: true,
        status: true,
        updatedAt: true,
        submittedAt: true,
      },
    }),
    db.accomplishmentReport.findMany({
      where: { organization: scope },
      select: {
        academicYear: true,
        status: true,
        organizationId: true,
      },
    }),
    db.activityProposal.findMany({
      where: { organization: scope },
      select: {
        id: true,
        organizationId: true,
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
    }),
  ]);

  const orgIds = orgRows.map((o) => o.id);
  const recIds = recognitionRows.map((r) => r.id);
  const collegeIdByOrg = Object.fromEntries(orgRows.map((o) => [o.id, o.collegeId]));
  const membersByOrg = new Map<string, { position: string; status: string }[]>();
  for (const m of memberRows) {
    const list = membersByOrg.get(m.organizationId) ?? [];
    list.push({ position: m.position, status: m.status });
    membersByOrg.set(m.organizationId, list);
  }
  const recsByOrg = new Map<string, AnalyticsOrg["recognitions"]>();
  for (const r of recognitionRows) {
    const list = recsByOrg.get(r.organizationId) ?? [];
    list.push({
      id: r.id,
      kind: r.kind as RecognitionKind,
      academicYear: r.academicYear,
      status: r.status as RecognitionStatus,
      updatedAt: r.updatedAt,
      submittedAt: r.submittedAt,
    });
    recsByOrg.set(r.organizationId, list);
  }
  const reportsByOrg = new Map<string, { academicYear: string; status: ReportStatus }[]>();
  for (const r of reportRows) {
    const list = reportsByOrg.get(r.organizationId) ?? [];
    list.push({ academicYear: r.academicYear, status: r.status as ReportStatus });
    reportsByOrg.set(r.organizationId, list);
  }
  const actsByOrg = new Map<string, AnalyticsActivity[]>();
  for (const a of activityRows) {
    const list = actsByOrg.get(a.organizationId) ?? [];
    list.push({
      id: a.id,
      academicYear: a.academicYear,
      status: a.status,
      phase: a.phase,
      scope: a.scope,
      startAt: a.startAt,
      endAt: a.endAt,
      expectedParticipants: a.expectedParticipants,
      estimatedBudget: a.estimatedBudget,
      attendanceCount: a._count.attendanceRecords,
      reportStatus: a.report?.status ?? null,
      actualParticipants: a.report?.actualParticipants ?? null,
      actualBudget: a.report?.actualBudget ?? null,
    });
    actsByOrg.set(a.organizationId, list);
  }

  const allOrgs: AnalyticsOrg[] = orgRows.map((o) => ({
    id: o.id,
    name: o.name,
    acronym: o.acronym,
    type: o.type,
    status: o.status,
    collegeId: o.collegeId,
    collegeName: o.college?.name ?? "",
    members: membersByOrg.get(o.id) ?? [],
    recognitions: recsByOrg.get(o.id) ?? [],
    reports: reportsByOrg.get(o.id) ?? [],
    activities: (actsByOrg.get(o.id) ?? []).sort((a, b) => a.startAt.getTime() - b.startAt.getTime()),
    requirementFiles: [],
  }));

  const collegeOpts = [
    ...new Map(
      orgRows
        .map((o) => (o.college ? ([o.college.id, o.college] as const) : null))
        .filter((x): x is readonly [string, { id: string; name: string }] => x != null)
    ).values(),
  ];

  // Phase B: scope-wide aggregates (depend only on orgIds/recIds).
  const [taggedFiles, deadlines, memberGroupRows, events, currentSteps, evaluations] =
    await Promise.all([
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

  for (const o of allOrgs) {
    o.requirementFiles = o.recognitions.flatMap((r) =>
      (taggedByRec.get(r.id) ?? []).map((a) => ({
        kind: a.kind as AttachmentKind,
        academicYear: r.academicYear,
        createdAt: a.createdAt,
      }))
    );
  }

  // Recognition-status filter is not a Prisma field ("NONE"); slice in memory.
  const orgs = filters.rec
    ? allOrgs.filter((o) => {
        const rec = o.recognitions.find((r) => r.academicYear === ay);
        return filters.rec === "NONE" ? !rec : rec?.status === filters.rec;
      })
    : allOrgs;

  return {
    ay,
    orgs,
    allOrgs,
    deadlines,
    memberRows: memberGroupRows,
    events,
    currentSteps,
    evaluations,
    collegeIdByOrg,
    collegeOpts,
  };
}

/** Memoize within a single Server Component render; `use cache` adds cross-request reuse. */
export const buildAnalyticsSnapshotMemo = cache(buildAnalyticsSnapshot);