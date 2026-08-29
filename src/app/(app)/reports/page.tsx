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
    </>
  );
}
