import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, scopedOrgWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { getSelectedAy } from "@/lib/ay-server";
import { ACTIVITY_SCOPE_LABELS, PROPOSAL_STATUS_META } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";

export const metadata: Metadata = { title: "Activity Proposals" };

type Search = { q?: string; status?: string };

const STATUS_OPTIONS = [
  ["DRAFT", "Draft"],
  ["SUBMITTED", "Pending"],
  ["ENDORSED", "Endorsed"],
  ["APPROVED", "Approved"],
  ["RETURNED", "Returned"],
  ["REJECTED", "Rejected"],
  ["COMPLETED", "Completed"],
] as const;

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const ay = await getSelectedAy();

  const proposals = await db.activityProposal.findMany({
    where: {
      academicYear: ay,
      organization: scopedOrgWhere(user),
      ...(sp.status ? { status: sp.status as never } : {}),
      ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" as const } } : {}),
    },
    include: {
      organization: { select: { id: true, name: true, acronym: true } },
      report: { select: { id: true } },
    },
    orderBy: [{ startAt: "desc" }],
  });

  return (
    <>
      <PageHeader
        title="Activity Proposals"
        description="Planned activities filed by organizations for adviser endorsement and approval."
        actions={
          can(user, "activity.submit") && (
            <Link
              href="/activities/new"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
            >
              <Plus className="size-4" aria-hidden />
              New proposal
            </Link>
          )
        }
      />

      <form action="/activities" className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-content-secondary">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Activity title…"
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

      {proposals.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="No activity proposals"
          description="No proposals match your filters or scope."
        />
      ) : (
        <>
          <Card className="hidden md:block">
            <TableWrap>
              <THead>
                <TH>Activity</TH>
                <TH>Organization</TH>
                <TH>Schedule</TH>
                <TH>Scope</TH>
                <TH>Status</TH>
                <TH>Report</TH>
              </THead>
              <tbody>
                {proposals.map((p) => {
                  const meta = PROPOSAL_STATUS_META[p.status];
                  return (
                    <TR key={p.id}>
                      <TD>
                        <Link href={`/activities/${p.id}`} className="font-semibold text-content hover:text-primary">
                          {p.title}
                        </Link>
                        {p.venue && (
                          <p className="text-xs text-content-secondary">{p.venue}</p>
                        )}
                      </TD>
                      <TD className="text-xs whitespace-nowrap text-content-secondary">
                        {p.organization.acronym ?? p.organization.name}
                      </TD>
                      <TD className="text-xs whitespace-nowrap text-content-secondary">
                        {formatDateTime(p.startAt)}
                        <span className="block">→ {formatDateTime(p.endAt)}</span>
                      </TD>
                      <TD className="text-xs whitespace-nowrap text-content-secondary">
                        {ACTIVITY_SCOPE_LABELS[p.scope]}
                      </TD>
                      <TD>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </TD>
                      <TD>
                        {p.report ? (
                          <Link
                            href={`/reports/${p.report.id}`}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            View report
                          </Link>
                        ) : p.status === "APPROVED" && can(user, "activity.submit") ? (
                          <Link
                            href={`/reports/new?proposal=${p.id}`}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            File report
                          </Link>
                        ) : (
                          <span className="text-xs text-content-muted">—</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </TableWrap>
          </Card>

          <ul className="space-y-3 md:hidden">
            {proposals.map((p) => {
              const meta = PROPOSAL_STATUS_META[p.status];
              return (
                <li key={p.id}>
                  <Card className="p-4">
                    <Link href={`/activities/${p.id}`} className="block">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display text-sm font-bold text-content">{p.title}</p>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      <p className="mt-1.5 text-xs text-content-secondary">
                        {p.organization.acronym ?? p.organization.name} ·{" "}
                        {ACTIVITY_SCOPE_LABELS[p.scope]}
                      </p>
                      <p className="mt-1 text-xs text-content-muted">
                        {formatDateTime(p.startAt)}
                      </p>
                    </Link>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
