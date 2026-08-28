import { auditExport, csvResponse, requireExporter, toCsv } from "@/lib/export";
import { can, scopedOrgWhere } from "@/lib/auth/rbac";
import type { AuthUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { currentAcademicYear } from "@/lib/utils";
import type { OrgType } from "@/generated/prisma/client";
import { ORG_TYPE_LABELS, RECOGNITION_STATUS_META } from "@/lib/constants";
import {
  assessRisk,
  bottleneckAlerts,
  budgetAlerts,
  budgetUtilizationPct,
  compliancePct,
  financialAlerts,
  financialCompliance,
  reportAlerts,
  requirementsChecklist,
  riskAlerts,
  signatureBottlenecks,
  stalledAlerts,
  type AnalyticsAlert,
} from "@/lib/analytics";
import { activityCompletionPct } from "@/lib/analytics";
import { monitorOrg } from "@/lib/monitoring";
import { RECOGNITION_WORKFLOW, inFlightStatuses } from "@/lib/workflow";

const SATISFIED = ["APPROVED", "RECOGNIZED"];
const FIN_LABEL: Record<string, string> = {
  SUBMITTED: "Submitted",
  OVERDUE: "Overdue",
  PENDING: "Unsubmitted",
};

export async function GET(request: Request) {
  const { user, error } = await requireExporter();
  if (error) return error;

  const url = new URL(request.url);
  const sp = url.searchParams;
  const toStr = (v: string | null) => v?.trim() ?? "";
  const ay = toStr(sp.get("ay")) || currentAcademicYear();

  const filterWhere = {
    ...(toStr(sp.get("org")) ? { id: toStr(sp.get("org")) } : {}),
    ...(toStr(sp.get("type")) ? { type: toStr(sp.get("type")) as OrgType } : {}),
    ...(toStr(sp.get("college")) ? { college: { name: toStr(sp.get("college")) } } : {}),
  };

  const data = await loadAnalytics(user, ay, filterWhere, toStr(sp.get("rec")));

  const matrix = toCsv(
    [
      "Organization",
      "Acronym",
      "Type",
      "College",
      `Recognition (AY ${ay})`,
      "Requirements met",
      "Requirements total",
      "Compliance %",
      "Financial",
      "Activities completed",
      "Activities planned",
      "Completion %",
      "Budget planned",
      "Budget actual",
      "Utilization %",
      "Risk",
      "Days to nearest deadline",
    ],
    data.matrixRows
  );

  const alertsCsv =
    `\r\n"ALERTS & RECOMMENDATIONS (rule-based)"\r\n` +
    toCsv(
      ["Priority", "Alert", "Why (rule)", "Detail", "Link"],
      data.alerts.map((a) => [a.priority, a.title, a.why, a.detail, a.href])
    );

  await auditExport(user, `analytics-${ay}.csv`, data.matrixRows.length);
  return csvResponse(`analytics-${ay}.csv`, matrix + alertsCsv);
}

type Row = {
  orgId: string;
  name: string;
  acronym: string | null;
  type: string;
  college: string | null;
  recognition: string;
  met: number;
  total: number;
  compliancePct: number | null;
  financial: string;
  completed: number;
  planned: number;
  completionPct: number | null;
  budgetPlanned: number;
  budgetActual: number;
  budgetUtil: number | null;
  risk: string;
  deadlineIn: string;
};

async function loadAnalytics(
  user: AuthUser,
  ay: string,
  filterWhere: Record<string, unknown>,
  recFilter: string
): Promise<{ matrixRows: unknown[][]; alerts: AnalyticsAlert[] }> {
  const now = new Date();

  const orgsRaw = await db.organization.findMany({
    where: scopedOrgWhere(user, filterWhere as never),
    select: {
      id: true,
      name: true,
      acronym: true,
      type: true,
      status: true,
      collegeId: true,
      college: { select: { name: true } },
      members: { where: { isCurrent: true }, select: { position: true, status: true } },
      recognitions: { select: { id: true, kind: true, academicYear: true, status: true, updatedAt: true } },
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
          _count: { select: { attendanceRecords: true } },
          report: { select: { status: true, actualParticipants: true } },
        },
      },
    },
  });

  const recIds = orgsRaw.flatMap((o) => o.recognitions.map((r) => r.id));
  const collegeIdByOrg = Object.fromEntries(orgsRaw.map((o) => [o.id, o.collegeId]));

  const [taggedFiles, deadlines, currentSteps] = await Promise.all([
    db.attachment.findMany({
      where: { entityType: "Recognition", kind: { not: null }, entityId: { in: recIds } },
      select: { entityId: true, kind: true, createdAt: true },
    }),
    db.deadline.findMany({
      where: { isActive: true },
      select: { id: true, name: true, process: true, academicYear: true, dueDate: true, scopeType: true, scopeCollegeId: true },
    }),
    db.signatureStep.findMany({
      where: { status: "CURRENT", route: { entityType: "SF" } },
      select: { role: true },
    }),
  ]);
  const taggedByRec = new Map<string, { kind: string; createdAt: Date }[]>();
  for (const t of taggedFiles) {
    if (!t.kind) continue;
    const list = taggedByRec.get(t.entityId) ?? [];
    list.push({ kind: t.kind, createdAt: t.createdAt });
    taggedByRec.set(t.entityId, list);
  }

  const snapshots = orgsRaw.map((o) => ({
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
      id: a.id,
      academicYear: a.academicYear,
      status: a.status,
      phase: a.phase,
      scope: a.scope,
      startAt: a.startAt,
      endAt: a.endAt,
      expectedParticipants: a.expectedParticipants,
      attendanceCount: a._count.attendanceRecords,
      reportStatus: a.report?.status ?? null,
      actualParticipants: a.report?.actualParticipants ?? null,
    })),
    requirementFiles: o.recognitions.flatMap((r) =>
      (taggedByRec.get(r.id) ?? []).map((a) => ({ kind: a.kind as never, academicYear: r.academicYear, createdAt: a.createdAt }))
    ),
  }));

  const filtered = recFilter
    ? snapshots.filter((o) => {
        const rec = o.recognitions.find((r) => r.academicYear === ay);
        return recFilter === "NONE" ? !rec : rec?.status === recFilter;
      })
    : snapshots;

  const risks = assessRisk(snapshots, deadlines, collegeIdByOrg, now);
  const monitored = filtered.map((o) =>
    monitorOrg(
      { id: o.id, name: o.name, acronym: o.acronym, collegeName: o.collegeName },
      o.activities
        .filter((a) => a.academicYear === ay)
        .map((a) => ({
          id: a.id ?? "",
          title: "",
          status: a.status,
          phase: a.phase,
          scope: a.scope,
          venue: null,
          startAt: a.startAt ?? now,
          endAt: a.endAt ?? now,
          estimatedBudget: null,
          actualBudget: null,
          expectedParticipants: a.expectedParticipants ?? null,
          actualParticipants: a.actualParticipants ?? null,
          attendanceCount: a.attendanceCount ?? 0,
          reportStatus: a.reportStatus,
        })),
      now
    )
  );

  const riskByOrg = new Map(risks.map((r) => [r.orgId, r]));
  const matrixRows: unknown[][] = filtered.map((o) => {
    const rec = o.recognitions.find((r) => r.academicYear === ay);
    const recLabel = rec
      ? RECOGNITION_STATUS_META[rec.status]?.label ?? rec.status
      : SATISFIED.some((s) => o.recognitions.some((x) => x.status === s && x.academicYear < ay))
        ? "Recognized (prior)"
        : "No application";
    const items = requirementsChecklist(o, ay);
    const mon = monitored.find((m) => m.id === o.id);
    const risk = riskByOrg.get(o.id);
    const deadlineAt = deadlines
      .filter((d) => d.academicYear === ay && applies(d, o, collegeIdByOrg[o.id]))
      .map((d) => d.dueDate.getTime())
      .sort((a, b) => a - b)[0];
    const row: Row = {
      orgId: o.id,
      name: o.name,
      acronym: o.acronym,
      type: ORG_TYPE_LABELS[o.type] ?? o.type,
      college: o.collegeName,
      recognition: recLabel,
      met: items.filter((i) => i.met).length,
      total: items.length,
      compliancePct: compliancePct(items),
      financial: FIN_LABEL[financialCompliance(o, ay, deadlines, collegeIdByOrg[o.id])] ?? "—",
      completed: mon?.completed ?? 0,
      planned: mon?.planned ?? 0,
      completionPct: mon ? activityCompletionPct(mon.planned, mon.completed) : null,
      budgetPlanned: mon?.budgetPlanned ?? 0,
      budgetActual: mon?.budgetActual ?? 0,
      budgetUtil: mon ? budgetUtilizationPct(mon.budgetPlanned, mon.budgetActual) : null,
      risk: risk ? (risk.level === "AT_RISK" ? `At Risk (${risk.unmet.length} unmet)` : `Due Soon (${risk.unmet.length} unmet)`) : "",
      deadlineIn: deadlineAt != null ? `${Math.max(0, Math.ceil((deadlineAt - now.getTime()) / 86_400_000))} day(s)` : "",
    };
    return [
      row.name,
      row.acronym ?? "",
      row.type,
      row.college ?? "",
      row.recognition,
      row.met,
      row.total,
      row.compliancePct ?? "",
      row.financial,
      row.completed,
      row.planned,
      row.completionPct ?? "",
      row.budgetPlanned > 0 ? row.budgetPlanned : "",
      row.budgetActual > 0 ? row.budgetActual : "",
      row.budgetUtil != null ? `${row.budgetUtil}%` : "",
      row.risk,
      row.deadlineIn,
    ];
  });

  const scopeIds = new Set(filtered.map((o) => o.id));
  const stalled: { entityId: string; orgId: string; orgName: string; kind: string; status: string; updatedAt: Date }[] = [];
  for (const o of filtered) {
    const rec = o.recognitions.find((r) => r.academicYear === ay);
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

  const alerts: AnalyticsAlert[] = [
    ...riskAlerts(risks).filter((a) => a.orgId && scopeIds.has(a.orgId ?? "")),
    ...financialAlerts(snapshots, ay, deadlines, collegeIdByOrg).filter((a) => scopeIds.has(a.orgId ?? "")),
    ...reportAlerts(monitored.map((m) => ({ orgId: m.id, orgName: m.acronym ?? m.name, count: m.endedWithoutReport.length }))),
    ...budgetAlerts(monitored).filter((a) => a.orgId && scopeIds.has(a.orgId ?? "")),
    ...stalledAlerts(stalled),
    ...(can(user, "analytics.view") ? bottleneckAlerts(signatureBottlenecks(currentSteps)) : []),
  ];

  return { matrixRows, alerts };
}

function applies(d: { scopeType: string; scopeCollegeId: string | null }, o: { type: string }, collegeId: string | null): boolean {
  if (d.scopeCollegeId && d.scopeCollegeId !== collegeId) return false;
  if (d.scopeType === "MOTHER") return o.type === "MOTHER";
  if (d.scopeType === "CHILD") return o.type === "CHILD";
  if (d.scopeType === "INDEPENDENT") return o.type === "INDEPENDENT";
  return true;
}