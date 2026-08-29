import { can } from "@/lib/auth/rbac";
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
import { FIN_META, deadlineAppliesLite } from "@/lib/analytics-ui";
import { buildAnalyticsSnapshot } from "@/lib/analytics-loader";

const SATISFIED = ["APPROVED", "RECOGNIZED"];

export type AnalyticsExportParams = {
  ay: string;
  org?: string;
  type?: string;
  college?: string;
  rec?: string;
};

export type AnalyticsExportTable = {
  matrixHeaders: string[];
  matrixRows: unknown[][];
  alerts: AnalyticsAlert[];
  orgCount: number;
};

/**
 * Shared computation for the analytics CSV and Excel endpoints. Builds the
 * compliance matrix + rule-based alert list for the current viewer's scope
 * and filters — the exact rows shown on the analytics workspace.
 */
export async function buildAnalyticsExport(
  user: Parameters<typeof buildAnalyticsSnapshot>[0],
  params: AnalyticsExportParams
): Promise<AnalyticsExportTable> {
  const snapshot = await buildAnalyticsSnapshot(user, {
    ay: params.ay,
    org: params.org,
    type: params.type,
    college: params.college,
    rec: params.rec,
  });
  const orgsScoped = snapshot.orgs;
  const orgs = snapshot.allOrgs;
  const { deadlines, collegeIdByOrg, currentSteps } = snapshot;

  const now = new Date();
  const risks = assessRisk(orgs, deadlines, collegeIdByOrg, now);
  const monitored = orgsScoped.map((o) =>
    monitorOrg(
      { id: o.id, name: o.name, acronym: o.acronym, collegeName: o.collegeName },
      o.activities
        .filter((a) => a.academicYear === params.ay)
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

  const riskByOrg = new Map(risks.map((r) => [r.orgId, r]));
  const matrixRows: unknown[][] = orgsScoped.map((o) => {
    const rec = o.recognitions.find((r) => r.academicYear === params.ay);
    const recLabel = rec
      ? RECOGNITION_STATUS_META[rec.status]?.label ?? rec.status
      : SATISFIED.some((s) => o.recognitions.some((x) => x.status === s && x.academicYear < params.ay))
        ? "Recognized (prior)"
        : "No application";
    const items = requirementsChecklist(o, params.ay);
    const mon = monitored.find((m) => m.id === o.id);
    const risk = riskByOrg.get(o.id);
    const deadlineAt = deadlines
      .filter((d) => d.academicYear === params.ay && deadlineAppliesLite(d, o, collegeIdByOrg[o.id]))
      .map((d) => d.dueDate.getTime())
      .sort((a, b) => a - b)[0];

    return [
      o.name,
      o.acronym ?? "",
      ORG_TYPE_LABELS[o.type as keyof typeof ORG_TYPE_LABELS] ?? o.type,
      o.collegeName ?? "",
      recLabel,
      items.filter((i) => i.met).length,
      items.length,
      compliancePct(items) ?? "",
      FIN_META[financialCompliance(o, params.ay, deadlines, collegeIdByOrg[o.id])].label,
      mon?.completed ?? 0,
      mon?.planned ?? 0,
      mon ? activityCompletionPct(mon.planned, mon.completed) ?? "" : "",
      (mon?.budgetPlanned ?? 0) > 0 ? mon?.budgetPlanned : "",
      (mon?.budgetActual ?? 0) > 0 ? mon?.budgetActual : "",
      mon ? budgetUtilizationPct(mon.budgetPlanned, mon.budgetActual) != null ? `${budgetUtilizationPct(mon.budgetPlanned, mon.budgetActual)}%` : "" : "",
      risk ? (risk.level === "AT_RISK" ? `At Risk (${risk.unmet.length} unmet)` : `Due Soon (${risk.unmet.length} unmet)`) : "",
      deadlineAt != null ? `${Math.max(0, Math.ceil((deadlineAt - now.getTime()) / 86_400_000))} day(s)` : "",
    ];
  });

  const scopeIds = new Set(orgsScoped.map((o) => o.id));
  const stalled: { entityId: string; orgId: string; orgName: string; kind: string; status: string; updatedAt: Date }[] = [];
  for (const o of orgsScoped) {
    const rec = o.recognitions.find((r) => r.academicYear === params.ay);
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
    ...financialAlerts(orgs, params.ay, deadlines, collegeIdByOrg).filter((a) => scopeIds.has(a.orgId ?? "")),
    ...reportAlerts(monitored.map((m) => ({ orgId: m.id, orgName: m.acronym ?? m.name, count: m.endedWithoutReport.length }))),
    ...budgetAlerts(monitored).filter((a) => a.orgId && scopeIds.has(a.orgId ?? "")),
    ...stalledAlerts(stalled),
    ...(can(user, "analytics.view") ? bottleneckAlerts(signatureBottlenecks(currentSteps)) : []),
  ];

  return {
    matrixHeaders: [
      "Organization",
      "Acronym",
      "Type",
      "College",
      `Recognition (AY ${params.ay})`,
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
    matrixRows,
    alerts,
    orgCount: orgsScoped.length,
  };
}

export const ALERT_HEADERS = ["Priority", "Alert", "Why (rule)", "Detail", "Link"];
export const alertRows = (alerts: AnalyticsAlert[]): unknown[][] =>
  alerts.map((a) => [a.priority, a.title, a.why, a.detail, a.href]);