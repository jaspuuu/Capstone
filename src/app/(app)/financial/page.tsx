import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Banknote, FileCheck, Percent, Settings2, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { currentAcademicYear, formatMoney } from "@/lib/utils";
import { RECOGNITION_STATUS_META } from "@/lib/constants";
import {
  PRIORITY_META,
  budgetAlerts,
  budgetUtilizationPct,
  financialAlerts,
  financialCompliance,
  shortAY,
} from "@/lib/analytics";
import { FIN_META } from "@/lib/analytics-ui";
import { monitorOrg } from "@/lib/monitoring";
import { buildAnalyticsSnapshotMemo } from "@/lib/analytics-loader";
import { FINANCIAL_STATUS_META, buildFinancialComplianceMemo } from "@/lib/financial";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { BarChart, DonutChart, type Slice } from "@/components/ui/charts";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
import { NoData } from "@/components/analytics/analytics-parts";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
export const instant = false;

export const metadata: Metadata = { title: "Financial Overview" };

const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, INFO: 3 } as const;

export default async function FinancialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("org.view");
  const sp = await searchParams;
  const toStr = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const now = new Date();
  const ay = toStr(sp.ay) || currentAcademicYear();

  const snapshot = await buildAnalyticsSnapshotMemo(user, {
    ay,
    org: toStr(sp.org) || undefined,
    type: toStr(sp.type) || undefined,
    college: toStr(sp.college) || undefined,
    rec: toStr(sp.rec) || undefined,
  });
  const orgsScoped = snapshot.orgs;
  const { allOrgs, deadlines, collegeIdByOrg, collegeOpts } = snapshot;

  const years = [
    ...new Set(
      [
        ...allOrgs.flatMap((o) => [
          ...o.recognitions.map((r) => r.academicYear),
          ...o.activities.map((a) => a.academicYear),
          ...o.requirementFiles.map((f) => f.academicYear),
        ]),
        ay,
        currentAcademicYear(),
      ].sort()
    ),
  ];

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

  const budgetPlanned = Math.round(monitored.reduce((s, o) => s + o.budgetPlanned, 0) * 100) / 100;
  const budgetActual = Math.round(monitored.reduce((s, o) => s + o.budgetActual, 0) * 100) / 100;
  const utilization = budgetUtilizationPct(budgetPlanned, budgetActual);

  const financialByOrg = new Map(
    orgsScoped.map((o) => [o.id, financialCompliance(o, ay, deadlines, collegeIdByOrg[o.id])] as const)
  );
  const finCounts = { SUBMITTED: 0, OVERDUE: 0, PENDING: 0 };
  for (const s of financialByOrg.values()) finCounts[s] += 1;
  const activeCount = orgsScoped.filter((o) => o.status === "ACTIVE").length;

  const alerts = [
    ...financialAlerts(allOrgs, ay, deadlines, collegeIdByOrg).filter((a) => a.orgId && orgsScoped.some((o) => o.id === a.orgId)),
    ...budgetAlerts(monitored).filter((a) => a.orgId && orgsScoped.some((o) => o.id === a.orgId)),
  ].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  // ---- Part 12: document/process compliance, one consistent status flow.
  const compliance = await buildFinancialComplianceMemo(user, ay);
  const compOrgs = compliance.orgs.filter((o) =>
    (!toStr(sp.org) || o.id === toStr(sp.org)) &&
    (!toStr(sp.type) || o.type === toStr(sp.type)) &&
    (!toStr(sp.college) || o.collegeName === toStr(sp.college))
  );

  const ATTENTION_STATES = new Set(["OVERDUE", "UNSUBMITTED", "DRAFT", "INCOMPLETE", "RETURNED"]);
  const attention: { orgId: string; orgName: string; orgAcronym: string | null; reqCode: string; reqName: string; status: string }[] = [];
  const totals: Record<string, number> = {};
  for (const org of compOrgs) {
    const row = compliance.cells.get(org.id);
    if (!row) continue;
    for (const req of compliance.requirements) {
      const cell = row.get(req.id);
      if (!cell) continue;
      totals[cell.status] = (totals[cell.status] ?? 0) + 1;
      if (ATTENTION_STATES.has(cell.status)) {
        attention.push({ orgId: org.id, orgName: org.name, orgAcronym: org.acronym, reqCode: req.code, reqName: req.name, status: cell.status });
      }
    }
  }
  attention.sort((a, b) => Number(b.status === "OVERDUE") - Number(a.status === "OVERDUE"));
  const N = (s: string) => totals[s] ?? 0;
  const canConfigure = can(user, "financial.manage");

  const rows = monitored
    .map((o) => ({
      id: o.id,
      name: o.name,
      acronym: o.acronym,
      collegeName: o.collegeName,
      planned: o.budgetPlanned,
      actual: o.budgetActual,
      util: budgetUtilizationPct(o.budgetPlanned, o.budgetActual),
      fin: financialByOrg.get(o.id) ?? "PENDING",
    }))
    .sort((a, b) => b.planned - a.planned);

  const topPlans = rows.slice(0, 8).map((r) => ({ label: r.acronym ?? r.name, value: r.planned }));
  const coverage: Slice[] = [
    { label: FIN_META.SUBMITTED.label, value: finCounts.SUBMITTED, tone: "success" },
    { label: FIN_META.OVERDUE.label, value: finCounts.OVERDUE, tone: "danger" },
    { label: FIN_META.PENDING.label, value: finCounts.PENDING, tone: "warning" },
  ];

  return (
    <>
      <PageHeader
        title="Financial"
        description={`Budget plans, expenditure, and accreditation financial compliance · AY ${ay}`}
        breadcrumb={[{ label: "Financial" }]}
      />

      {canConfigure && (
        <div className="mb-6 flex justify-end">
          <Link
            href="/financial/requirements"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-content hover:border-primary"
          >
            <Settings2 className="size-4" aria-hidden />
            Configure requirements
          </Link>
        </div>
      )}

      {/* Part 12: submission-status compliance */}
      <Card className="mb-6">
        <CardHeader
          title="Financial document compliance"
          description={`Filing status across configured requirements · ${compOrgs.length} organizations in scope`}
        />
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {(
              [
                ["Submitted", "SUBMITTED", "text-blue-600"],
                ["Under review", "UNDER_REVIEW", "text-blue-600"],
                ["Returned", "RETURNED", "text-red-600"],
                ["Approved", "APPROVED", "text-emerald-600"],
                ["Overdue", "OVERDUE", "text-red-600"],
                ["Not filed", "UNSUBMITTED", "text-content-muted"],
              ] as const
            ).map(([label, key, cls]) => (
              <div key={key} className="rounded-xl border border-line bg-background p-3 text-center">
                <p className={`font-display text-2xl font-bold ${cls}`}>{N(key)}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">{label}</p>
              </div>
            ))}
          </div>

          {attention.length > 0 ? (
            <TableWrap>
              <THead>
                <TH>Organization</TH>
                <TH>Requirement</TH>
                <TH>Status</TH>
                <TH></TH>
              </THead>
              <tbody>
                {attention.map((a, i) => (
                  <TR key={`${a.orgId}-${a.reqCode}-${i}`}>
                    <TD>
                      <Link href={`/organizations/${a.orgId}/financial`} className="font-semibold text-content hover:text-primary">
                        {a.orgAcronym ?? a.orgName}
                      </Link>
                      <span className="block text-[11px] text-content-secondary">{a.orgName}</span>
                    </TD>
                    <TD>
                      <span className="text-sm text-content">{a.reqName}</span>
                      <span className="ml-1.5 text-[11px] text-content-muted">{a.reqCode}</span>
                    </TD>
                    <TD>
                      <Badge tone={FINANCIAL_STATUS_META[a.status]?.tone ?? "neutral"}>
                        {FINANCIAL_STATUS_META[a.status]?.label ?? a.status}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      {a.status === "OVERDUE" || a.status === "UNSUBMITTED" || a.status === "DRAFT" || a.status === "INCOMPLETE" ? (
                        <Link href={`/organizations/${a.orgId}/financial`} className="text-xs font-semibold text-primary hover:underline">
                          File now →
                        </Link>
                      ) : (
                        <Link href={`/organizations/${a.orgId}/financial`} className="text-xs font-semibold text-primary hover:underline">
                          Review →
                        </Link>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <p className="text-sm text-content-muted">
              All organizations in scope are filed up to date. Requirement statuses refresh as documents are
              signed, returned, resubmitted, or archived.
            </p>
          )}
        </CardContent>
      </Card>

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
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Planned budget" value={formatMoney(budgetPlanned)} icon={Wallet} iconTone="gold" hint={`${orgsScoped.length} organizations · AY ${ay}`} />
            <StatCard label="Actual expenditure" value={formatMoney(budgetActual)} icon={Banknote} hint="from filed accomplishment reports" />
            <StatCard
              label="Budget utilization"
              value={utilization != null ? `${utilization}%` : "—"}
              icon={Percent}
              iconTone="warning"
              hint={budgetActual > 0 ? `${formatMoney(budgetActual)} of ${formatMoney(budgetPlanned)}` : "no expenditure yet"}
            />
            <StatCard label="Financial reports filed" value={finCounts.SUBMITTED} icon={FileCheck} iconTone="success" hint={`of ${activeCount} active organizations`} />
            <StatCard label="Financial reports overdue" value={finCounts.OVERDUE} icon={AlertTriangle} iconTone="danger" hint="accreditation deadline passed" />
          </div>

          {alerts.length > 0 && (
            <Card className="mb-6 border-danger/40">
              <CardHeader
                title="Financial attention"
                description="Overdue accreditation financial reports and budget variances flagged by rule."
              />
              <CardContent>
                <ul className="space-y-2">
                  {alerts.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-line px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge tone={PRIORITY_META[a.priority].tone}>{PRIORITY_META[a.priority].label}</Badge>
                          <p className="text-sm font-semibold text-content">{a.title}</p>
                        </div>
                        <p className="mt-1 text-xs text-content-secondary">
                          {a.detail} <span className="text-content-muted">— {a.why}</span>
                        </p>
                      </div>
                      <Link href={a.href} className="text-xs font-semibold text-primary hover:underline">
                        Review →
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader title="Per-organization ledger" description={`Approved activity budgets vs. actual expenditure and financial-report status for AY ${ay}.`} />
            <CardContent>
              <TableWrap>
                <THead>
                  <TH>Organization</TH>
                  <TH>College</TH>
                  <TH>Financial report</TH>
                  <TH>Planned</TH>
                  <TH>Actual</TH>
                  <TH>Utilization</TH>
                  <TH>Note</TH>
                </THead>
                <tbody>
                  {rows.map((r) => {
                    const overrun = r.planned > 0 && r.actual > r.planned * 1.05;
                    const noPlan = r.planned <= 0 && r.actual > 0;
                    return (
                      <TR key={r.id}>
                        <TD>
                          <Link href={`/organizations/${r.id}`} className="font-semibold text-content hover:text-primary">
                            {r.acronym ?? r.name}
                          </Link>
                          <span className="block text-[11px] text-content-secondary">{r.name}</span>
                        </TD>
                        <TD className="text-xs text-content-secondary">{r.collegeName || "—"}</TD>
                        <TD>
                          <Badge tone={FIN_META[r.fin].tone}>{FIN_META[r.fin].label}</Badge>
                        </TD>
                        <TD className="tabular-nums text-xs">{formatMoney(r.planned)}</TD>
                        <TD className="tabular-nums text-xs">{formatMoney(r.actual)}</TD>
                        <TD>
                          {r.util != null ? (
                            <Badge tone={r.util > 105 ? "danger" : r.util >= 70 ? "success" : "neutral"}>{r.util}%</Badge>
                          ) : (
                            <span className="text-xs text-content-muted">—</span>
                          )}
                        </TD>
                        <TD className="min-w-24">
                          {overrun ? (
                            <Badge tone="danger">overrun</Badge>
                          ) : noPlan ? (
                            <Badge tone="warning">spending, no plan</Badge>
                          ) : (
                            <span className="text-xs text-content-muted">—</span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                  {rows.length === 0 && (
                    <TR>
                      <td colSpan={7} className="py-8 text-center text-sm text-content-muted">
                        No organizations in your scope yet.
                      </td>
                    </TR>
                  )}
                </tbody>
              </TableWrap>
            </CardContent>
          </Card>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Financial report coverage" description="Accreditation Financial Report submissions for the year." />
              <CardContent>
                <DonutChart data={coverage} ariaLabel="Financial report coverage" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader title="Largest budgets" description="Organizations by approved activity budget for the year." />
              <CardContent>
                {topPlans.some((p) => p.value > 0) ? (
                  <BarChart data={topPlans} ariaLabel="Planned budgets by organization" />
                ) : (
                  <p className="text-sm text-content-muted">No approved activity budgets on record for this year.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}