import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, scopedOrgWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { getSelectedAy } from "@/lib/ay-server";
import { REPORT_STATUS_META } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
export const instant = false;

export const metadata: Metadata = { title: "Accomplishment Reports" };

type Search = { q?: string; status?: string };

const STATUS_OPTIONS = [
  ["DRAFT", "Draft"],
  ["SUBMITTED", "Pending"],
  ["ACCEPTED", "Accepted"],
  ["RETURNED", "Returned"],
] as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const ay = await getSelectedAy();

  const reports = await db.accomplishmentReport.findMany({
    where: {
      academicYear: ay,
      organization: scopedOrgWhere(user),
      ...(sp.status ? { status: sp.status as never } : {}),
      ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" as const } } : {}),
    },
    include: {
      organization: { select: { id: true, name: true, acronym: true } },
      activityProposal: { select: { id: true, title: true } },
    },
    orderBy: [{ heldOn: "desc" }],
  });

  // Approved proposals this AY without a report yet — the filing gap OSAS sees.
  const awaiting = await db.activityProposal.findMany({
    where: { status: "APPROVED", academicYear: ay, report: null, organization: scopedOrgWhere(user) },
    include: { organization: { select: { acronym: true, name: true } } },
    orderBy: { endAt: "asc" },
  });
  const now = new Date();

  const KPI = (["SUBMITTED", "RETURNED", "DRAFT", "ACCEPTED"] as const).map((key) => ({
    key,
    label: REPORT_STATUS_META[key].label,
    count: reports.filter((r) => r.status === key).length,
  }));

  return (
    <>
      <PageHeader
        title="Accomplishment Reports"
        description="Documentation of activities conducted by organizations."
        actions={
          can(user, "activity.submit") && (
            <Link
              href="/reports/new"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
            >
              <Plus className="size-4" aria-hidden />
              New report
            </Link>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {KPI.map((k) => (
          <div key={k.key} className="rounded-xl border border-line bg-background p-3 text-center">
            <p className={`font-display text-2xl font-bold ${k.count > 0 ? "text-content" : "text-content-muted"}`}>
              {k.count}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">{k.label}</p>
          </div>
        ))}
      </div>

      <form action="/reports" className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-content-secondary">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Report title…"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <div className="w-48">
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-content-secondary">
            Status
          </label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm">
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-10 rounded-lg bg-primary-dark px-4 text-sm font-semibold text-white hover:bg-primary">
          Apply
        </button>
      </form>

      {reports.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No accomplishment reports"
          description="No reports match your filters or scope."
        />
      ) : (
        <>
          <Card className="hidden md:block">
            <TableWrap>
              <THead>
                <TH>Report</TH>
                <TH>Organization</TH>
                <TH>Date held</TH>
                <TH>Linked proposal</TH>
                <TH>Status</TH>
              </THead>
              <tbody>
                {reports.map((r) => {
                  const meta = REPORT_STATUS_META[r.status];
                  return (
                    <TR key={r.id}>
                      <TD>
                        <Link href={`/reports/${r.id}`} className="font-semibold text-content hover:text-primary">
                          {r.title}
                        </Link>
                      </TD>
                      <TD className="text-xs whitespace-nowrap text-content-secondary">
                        {r.organization.acronym ?? r.organization.name}
                      </TD>
                      <TD className="text-xs whitespace-nowrap text-content-secondary">
                        {formatDate(r.heldOn)}
                      </TD>
                      <TD className="text-xs text-content-secondary">
                        {r.activityProposal ? (
                          <Link href={`/activities/${r.activityProposal.id}`} className="text-primary hover:underline">
                            {r.activityProposal.title}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </TableWrap>
          </Card>

          <ul className="space-y-3 md:hidden">
            {reports.map((r) => {
              const meta = REPORT_STATUS_META[r.status];
              return (
                <li key={r.id}>
                  <Card className="p-4">
                    <Link href={`/reports/${r.id}`} className="block">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display text-sm font-bold text-content">{r.title}</p>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      <p className="mt-1.5 text-xs text-content-secondary">
                        {r.organization.acronym ?? r.organization.name} · Held{" "}
                        {formatDate(r.heldOn)}
                      </p>
                    </Link>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Card className="mt-6">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-bold text-content">
            Activities awaiting a report
          </h2>
          <p className="mt-0.5 text-xs text-content-secondary">
            Approved activities with no accomplishment report filed yet this AY.
          </p>
        </div>
        <div className="px-5 py-4">
          {awaiting.length === 0 ? (
            <p className="text-sm text-content-muted">
              No approved activities are missing a report — every planned activity is filed up to date.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {awaiting.map((a) => {
                const overdue = a.endAt && a.endAt.getTime() < now.getTime();
                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-content">{a.title}</p>
                      <p className="text-xs text-content-secondary">
                        {a.organization.acronym ?? a.organization.name}
                        {a.endAt && <span> · planned end {formatDate(a.endAt)}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {overdue && (
                        <Badge tone="danger">Overdue</Badge>
                      )}
                      <Link
                        href={`/reports/new?proposal=${a.id}`}
                        className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-content hover:border-primary hover:text-primary"
                      >
                        File report
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}
