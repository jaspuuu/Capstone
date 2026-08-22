import type { Metadata } from "next";
import { Award, CalendarPlus, ClipboardCheck, FileCheck, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { scopedOrgWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { currentAcademicYear } from "@/lib/utils";
import {
  assessRisk,
  compliancePct,
  describeOrg,
  diagnose,
  diagnoseRequirements,
  financialCompliance,
  pctChange,
  planOfActivitiesStatus,
  requirementsChecklist,
  shortAY,
  trend,
  requirementLabel,
  type FinancialStatus,
  type OrgSnapshot,
  type PlanStatus,
} from "@/lib/analytics";
import type { AttachmentKind } from "@/lib/attachments";
import { RECOGNITION_STATUS_META } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BarChart, LineChart, ProportionBar } from "@/components/ui/charts";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const user = await requirePermission("analytics.view");
  const ay = currentAcademicYear();

  const orgsRaw = await db.organization.findMany({
    where: scopedOrgWhere(user),
    select: {
      id: true,
      name: true,
      acronym: true,
      type: true,
      status: true,
      collegeId: true,
      college: { select: { name: true } },
      members: { where: { isCurrent: true }, select: { position: true } },
      recognitions: { select: { id: true, kind: true, academicYear: true, status: true } },
      activities: { select: { academicYear: true, status: true, scope: true } },
      reports: { select: { academicYear: true, status: true } },
    },
  });
  const recIds = orgsRaw.flatMap((o) => o.recognitions.map((r) => r.id));
  const orgIds = orgsRaw.map((o) => o.id);
  const collegeIdByOrg = Object.fromEntries(orgsRaw.map((o) => [o.id, o.collegeId]));

  const [taggedFiles, deadlines, memberRows, recStages, actIds, repIds] = await Promise.all([
    db.attachment.findMany({
      where: { entityType: "Recognition", kind: { not: null }, entityId: { in: recIds } },
      select: { entityId: true, kind: true, createdAt: true },
    }),
    db.deadline.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, process: true, academicYear: true,
        dueDate: true, scopeType: true, scopeCollegeId: true,
      },
    }),
    db.organizationMember.groupBy({
      by: ["academicYear"],
      _count: { _all: true },
      where: { organizationId: { in: orgIds }, isCurrent: true },
    }),
    db.recognition.findMany({
      where: { organizationId: { in: orgIds }, submittedAt: { not: null } },
      select: { id: true, submittedAt: true, reviewedAt: true, decidedAt: true },
    }),
    db.activityProposal.findMany({
      where: { organizationId: { in: orgIds } },
      select: { id: true },
    }),
    db.accomplishmentReport.findMany({
      where: { organizationId: { in: orgIds } },
      select: { id: true },
    }),
  ]);

  // Tagged checklist files grouped by their parent recognition record.
  const taggedByRec = new Map<string, { kind: AttachmentKind; createdAt: Date }[]>();
  for (const t of taggedFiles) {
    if (!t.kind) continue;
    const list = taggedByRec.get(t.entityId) ?? [];
    list.push({ kind: t.kind, createdAt: t.createdAt });
    taggedByRec.set(t.entityId, list);
  }

  const orgs: OrgSnapshot[] = orgsRaw.map((o) => ({
    id: o.id,
    name: o.name,
    acronym: o.acronym,
    type: o.type,
    status: o.status,
    collegeName: o.college?.name ?? null,
    members: o.members,
    recognitions: o.recognitions,
    activities: o.activities,
    reports: o.reports,
    requirementFiles: o.recognitions.flatMap((r) =>
      (taggedByRec.get(r.id) ?? []).map((a) => ({
        kind: a.kind,
        academicYear: r.academicYear,
        createdAt: a.createdAt,
      }))
    ),
  }));

  const auditRows = await db.auditLog.findMany({
    where: {
      action: { in: ["APPLICATION_RETURNED", "APPLICATION_REJECTED", "ACTIVITY_RETURNED", "ACTIVITY_REJECTED", "REPORT_RETURNED"] },
      OR: [
        { entityType: "Recognition", entityId: { in: recStages.map((r) => r.id) } },
        { entityType: "ActivityProposal", entityId: { in: actIds.map((a) => a.id) } },
        { entityType: "AccomplishmentReport", entityId: { in: repIds.map((r) => r.id) } },
      ],
    },
    select: { action: true, entityType: true },
  });

  // ---- Layer 1: descriptive ------------------------------------------------
  const rows = orgs.map((o) => describeOrg(o, ay));
  const checklistByOrg = new Map(
    orgs.map((o) => [o.id, requirementsChecklist(o, ay)] as const)
  );
  const financialByOrg = new Map(
    orgs.map((o) => [o.id, financialCompliance(o, ay, deadlines, collegeIdByOrg[o.id])] as const)
  );
  const planByOrg = new Map(orgs.map((o) => [o.id, planOfActivitiesStatus(o, ay)] as const));
  const activeChecklists = checklistByOrg
    .entries()
    .filter(([id]) => orgs.find((o) => o.id === id)?.status === "ACTIVE")
    .map(([, items]) => compliancePct(items))
    .toArray();
  const avgCompliance = activeChecklists.length
    ? Math.round(activeChecklists.reduce((s, p) => s + p, 0) / activeChecklists.length)
    : null;
  const activeCount = orgs.filter((o) => o.status === "ACTIVE").length;
  const recognizedCount = rows.filter((r) => r.recognitionSatisfied).length;
  const actsFiledAY = orgs.reduce(
    (n, o) => n + o.activities.filter((a) => a.academicYear === ay).length, 0);
  const reportsAcceptedAY = orgs.reduce(
    (n, o) => n + o.reports.filter((r) => r.academicYear === ay && r.status === "ACCEPTED").length, 0);
  const reportsFiledAY = orgs.reduce(
    (n, o) => n + o.reports.filter((r) => r.academicYear === ay && ["SUBMITTED", "ACCEPTED"].includes(r.status)).length, 0);

  // ---- Layers 2-3 ----------------------------------------------------------
  const diagnostic = diagnose(auditRows, recStages);
  const reqDiagnostic = diagnoseRequirements(orgs, ay, deadlines, collegeIdByOrg);
  const trends = trend(
    memberRows.map((m) => ({ academicYear: m.academicYear })),
    orgs
  );

  // ---- Layers 4-5 ----------------------------------------------------------
  const risks = assessRisk(
    orgs,
    deadlines,
    collegeIdByOrg
  );
  const atRisk = risks.filter((r) => r.level === "AT_RISK");
  const dueSoon = risks.filter((r) => r.level === "DUE_SOON");

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Accreditation compliance monitoring · AY ${ay}`}
        breadcrumb={[{ label: "Analytics" }]}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Organizations" value={`${activeCount}/${orgs.length}`} icon={Users} hint="active / registered" href="/organizations" />
        <StatCard label="Recognized" value={`${recognizedCount}/${orgs.length}`} icon={Award} iconTone="success" hint={`satisfied for AY ${shortAY(ay)}`} href="/recognition" />
        <StatCard label="Activities filed" value={actsFiledAY} icon={CalendarPlus} iconTone="info" hint={`AY ${shortAY(ay)}`} href="/activities" />
        <StatCard label="Reports accepted" value={reportsFiledAY > 0 ? `${Math.round((reportsAcceptedAY / reportsFiledAY) * 100)}%` : "—"} icon={ClipboardCheck} iconTone="warning" hint={`${reportsAcceptedAY} of ${reportsFiledAY} filed`} href="/reports" />
        <StatCard
          label="Documents complete"
          value={avgCompliance != null ? `${avgCompliance}%` : "—"}
          icon={FileCheck}
          iconTone="success"
          hint="avg accreditation checklist"
        />
      </div>

      {/* Layer 4+5: rule-based alerting & prescriptive recommendations */}
      <Card className="mb-6">
        <CardHeader
          title="Risk alerts & recommendations"
          description={`Fixed rules: “At Risk” when an organization has two or more unmet requirements within 7 days of the deadline. Recommendations are selected from a predefined action set.`}
        />
        <CardContent className="space-y-3">
          {risks.length === 0 ? (
            <Alert tone="success" title="No alerts">
              No organization currently meets a risk threshold.
            </Alert>
          ) : (
            <>
              {atRisk.length > 0 && (
                <Alert tone="danger" title={`${atRisk.length} organization${atRisk.length > 1 ? "s" : ""} at risk`}>
                  These organizations have multiple unmet requirements due within 7 days.
                </Alert>
              )}
              <ul className="space-y-3">
                {[...atRisk, ...dueSoon].map((r) => (
                  <li key={r.orgId} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-content">{r.orgName}</p>
                      <Badge tone={r.level === "AT_RISK" ? "danger" : "warning"}>
                        {r.level === "AT_RISK" ? "At Risk" : "Due Soon"}
                      </Badge>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-content-secondary">
                      {r.unmet.map((u) => (
                        <li key={`${u.deadlineId}-${u.requirementKey ?? "application"}`}>
                          • {u.requirementKey ? `${requirementLabel(u.requirementKey)} (${u.deadlineName})` : u.deadlineName} —{" "}
                          {u.overdue
                            ? `overdue by ${Math.abs(u.daysLeft)} day${Math.abs(u.daysLeft) === 1 ? "" : "s"}`
                            : `due in ${u.daysLeft} day${u.daysLeft === 1 ? "" : "s"}`}
                          {u.repeatedFromPrevAY && " (also missed last cycle)"}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 rounded-lg bg-primary-light px-3 py-2 text-xs font-semibold text-primary">
                      Recommended action: {r.recommendation}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* Layer 3: trend analytics */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Membership per cycle" description={changeHint(pctChange(trends.members), "members")} />
          <CardContent>
            {trends.members.length > 0 ? (
              <BarChart data={trends.members} ariaLabel="Total members per academic year" />
            ) : (
              <p className="text-sm text-content-muted">No membership data yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Recognitions conferred" description={changeHint(pctChange(trends.recognitionsApproved), "recognitions")} />
          <CardContent>
            {trends.recognitionsApproved.length > 0 ? (
              <BarChart data={trends.recognitionsApproved} ariaLabel="Recognitions approved per academic year" barClassName="fill-success" />
            ) : (
              <p className="text-sm text-content-muted">No recognition data yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Activities filed" description={changeHint(pctChange(trends.activitiesFiled), "activities")} />
          <CardContent>
            {trends.activitiesFiled.length > 0 ? (
              <LineChart data={trends.activitiesFiled} ariaLabel="Activity proposals filed per academic year" />
            ) : (
              <p className="text-sm text-content-muted">No activity data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Layer 2: diagnostic */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Workflow stage durations" description="Average calendar days between signatory stages on accreditation applications." />
          <CardContent>
            <dl className="grid grid-cols-1 gap-3">
              {diagnostic.stageDays.map((s) => (
                <div key={s.label} className="rounded-xl border border-line px-4 py-3 text-center">
                  <dt className="text-[11px] font-semibold tracking-wide text-content-secondary uppercase">{s.label}</dt>
                  <dd className="mt-1 font-display text-xl font-bold text-content tabular-nums">
                    {s.value}
                    <span className="ml-1 text-xs font-medium text-content-secondary">days</span>
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Most returned / rejected" description="Which requirement type fails review most often." />
          <CardContent>
            {diagnostic.returnedByEntity.length > 0 ? (
              <BarChart data={diagnostic.returnedByEntity} ariaLabel="Returns and rejections by requirement type" barClassName="fill-danger" />
            ) : (
              <p className="text-sm text-content-muted">No returns or rejections recorded yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Most missed requirements" description="SF-001 checklist items still unmet across active organizations, plus late submissions after the deadline." />
          <CardContent className="space-y-4">
            {reqDiagnostic.missed.length > 0 ? (
              <BarChart data={reqDiagnostic.missed.slice(0, 5)} ariaLabel="Unmet accreditation requirements across organizations" barClassName="fill-warning" />
            ) : (
              <p className="text-sm text-content-muted">Every checklist item is satisfied — nothing missed.</p>
            )}
            {reqDiagnostic.late.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-content-secondary uppercase">Submitted late</p>
                <ul className="space-y-0.5 text-xs text-content-secondary">
                  {reqDiagnostic.late.slice(0, 3).map((l) => (
                    <li key={l.label}>• {l.label} — {l.value} late submission{l.value === 1 ? "" : "s"}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Layer 1 table */}
      <Card>
        <CardHeader title="Organization compliance" description={`Per-organization indicators for AY ${ay}.`} />
        <CardContent>
          <TableWrap>
            <table>
              <THead>
                <TR>
                  <TH>Organization</TH>
                  <TH>Members</TH>
                  <TH>Officer ratio</TH>
                  <TH>Recognition</TH>
                  <TH>Plan & activities</TH>
                  <TH>Reports</TH>
                  <TH>Requirements</TH>
                  <TH>Financial</TH>
                  <TH>Risk</TH>
                </TR>
              </THead>
              <tbody>
                {rows.map((r) => {
                  const risk = risks.find((x) => x.orgId === r.id);
                  return (
                    <TR key={r.id}>
                      <TD>
                        <span className="font-semibold text-content">{r.acronym ?? r.name}</span>
                        <span className="block text-[11px] text-content-secondary">{r.collegeName}</span>
                      </TD>
                      <TD className="tabular-nums">{r.memberCount}</TD>
                      <TD className="tabular-nums">{r.officerRatio}</TD>
                      <TD>
                        {r.recognitionSatisfied ? (
                          <Badge tone="success">Recognized</Badge>
                        ) : (
                          <Badge tone={RECOGNITION_STATUS_META[r.recognitionLabel]?.tone ?? "neutral"}>
                            {RECOGNITION_STATUS_META[r.recognitionLabel]?.label ?? "No application"}
                          </Badge>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={PLAN_STATUS_META[planByOrg.get(r.id) ?? "MISSING"].tone}>
                          {PLAN_STATUS_META[planByOrg.get(r.id) ?? "MISSING"].label}
                        </Badge>
                        <span className="mt-1 block text-[11px] text-content-secondary">
                          {r.activitiesApprovedUp}/{r.activitiesFiled} proposals approved
                        </span>
                      </TD>
                      <TD className="tabular-nums">{r.reportsAccepted}/{r.reportsFiled}</TD>
                      <TD className="min-w-28">
                        <ProportionBar
                          value={checklistByOrg.get(r.id)?.filter((i) => i.met).length ?? 0}
                          total={checklistByOrg.get(r.id)?.length ?? 7}
                        />
                      </TD>
                      <TD>
                        <Badge tone={FINANCIAL_META[financialByOrg.get(r.id) ?? "PENDING"].tone}>
                          {FINANCIAL_META[financialByOrg.get(r.id) ?? "PENDING"].label}
                        </Badge>
                      </TD>
                      <TD>
                        {risk ? (
                          <Badge tone={risk.level === "AT_RISK" ? "danger" : "warning"}>
                            {risk.level === "AT_RISK" ? "At Risk" : "Due Soon"}
                          </Badge>
                        ) : (
                          <span className="text-xs text-content-muted">—</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
                {rows.length === 0 && (
                  <TR>
                    <td colSpan={9} className="py-8 text-center text-sm text-content-muted">
                      No organizations in your scope yet.
                    </td>
                  </TR>
                )}
              </tbody>
            </table>
          </TableWrap>
        </CardContent>
      </Card>
    </>
  );
}

function changeHint(change: number | null, noun: string): string | undefined {
  if (change == null) return undefined;
  const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return `${dir} ${Math.abs(change)}% vs previous cycle (${noun})`;
}

const FINANCIAL_META: Record<FinancialStatus, { tone: "success" | "danger" | "warning"; label: string }> = {
  SUBMITTED: { tone: "success", label: "Submitted" },
  OVERDUE: { tone: "danger", label: "Overdue" },
  PENDING: { tone: "warning", label: "Pending" },
};

const PLAN_STATUS_META: Record<PlanStatus, { tone: "success" | "info" | "neutral"; label: string }> = {
  APPROVED: { tone: "success", label: "Approved" },
  FILED: { tone: "info", label: "Filed" },
  DRAFT_ONLY: { tone: "neutral", label: "Draft only" },
  MISSING: { tone: "neutral", label: "None" },
};
