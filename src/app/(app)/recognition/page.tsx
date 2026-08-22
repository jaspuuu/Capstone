import type { Metadata } from "next";
import Link from "next/link";
import { Award, Download, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, orgScopeWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { RECOGNITION_STATUS_META } from "@/lib/constants";
import { currentAcademicYear, formatDateTime, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";

export const metadata: Metadata = { title: "Recognition & Renewal" };

type Search = { q?: string; status?: string; kind?: string };

export default async function RecognitionPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const ay = currentAcademicYear();

  const where = {
    organization: orgScopeWhere(user),
    ...(sp.status ? { status: sp.status as never } : {}),
    ...(sp.kind ? { kind: sp.kind as never } : {}),
    ...(sp.q
      ? { organization: { name: { contains: sp.q, mode: "insensitive" as const } } }
      : {}),
  };

  const [records, canSubmit] = await Promise.all([
    db.recognition.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true, acronym: true, collegeId: true } },
        decidedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ academicYear: "desc" }, { updatedAt: "desc" }],
    }),
    Promise.resolve(can(user, "recognition.submit")),
  ]);

  return (
    <>
      <PageHeader
        title="Recognition & Renewal"
        description={`Accreditation applications and renewals. Current academic year: ${ay}.`}
        actions={
          <>
            {can(user, "analytics.view") && (
              <>
                <a
                  href="/export/recognitions"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content hover:border-primary hover:text-primary"
                >
                  <Download className="size-4" aria-hidden />
                  Export CSV
                </a>
                <a
                  href="/export/recognitions.xlsx"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content hover:border-primary hover:text-primary"
                >
                  <Download className="size-4" aria-hidden />
                  Excel
                </a>
              </>
            )}
            {canSubmit && (
              <Link
                href="/recognition/new"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
              >
                <Plus className="size-4" aria-hidden />
                New application
              </Link>
            )}
          </>
        }
      />

      {/* Filters */}
      <form action="/recognition" className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-content-secondary">
            Organization
          </label>
          <input
            id="q"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search by organization name…"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <div className="w-48">
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-content-secondary">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={sp.status ?? ""}
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm"
          >
            <option value="">Any status</option>
            {Object.entries(RECOGNITION_STATUS_META).map(([v, m]) => (
              <option key={v} value={v}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label htmlFor="kind" className="mb-1 block text-xs font-medium text-content-secondary">
            Kind
          </label>
          <select
            id="kind"
            name="kind"
            defaultValue={sp.kind ?? ""}
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm"
          >
            <option value="">Any kind</option>
            <option value="INITIAL">Initial</option>
            <option value="RENEWAL">Renewal</option>
          </select>
        </div>
        <button type="submit" className="h-10 rounded-lg bg-primary-dark px-4 text-sm font-semibold text-white hover:bg-primary">
          Apply
        </button>
        <Link
          href="/recognition"
          className="inline-flex h-10 items-center rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content"
        >
          Reset
        </Link>
      </form>

      {records.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No recognition records"
          description="No applications match your filters or scope."
        />
      ) : (
        <>
          <Card className="hidden md:block">
            <TableWrap>
              <THead>
                <TH>Organization</TH>
                <TH>Academic year</TH>
                <TH>Kind</TH>
                <TH>Status</TH>
                <TH>Submitted</TH>
                <TH>Decided by</TH>
                <TH />
              </THead>
              <tbody>
                {records.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/recognition/${r.id}`} className="font-semibold text-primary hover:underline">
                        {r.organization.acronym ?? r.organization.name}
                      </Link>
                      {r.organization.acronym && (
                        <span className="block max-w-56 truncate text-xs text-content-secondary">
                          {r.organization.name}
                        </span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap tabular-nums">{r.academicYear}</TD>
                    <TD className="text-xs text-content-secondary">
                      {r.kind === "RENEWAL" ? "Renewal" : "Initial"}
                    </TD>
                    <TD>
                      <Badge tone={RECOGNITION_STATUS_META[r.status].tone}>
                        {RECOGNITION_STATUS_META[r.status].label}
                      </Badge>
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-content-secondary">
                      {formatDateTime(r.submittedAt)}
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-content-secondary">
                      {r.decidedBy ? fullName(r.decidedBy) : "—"}
                    </TD>
                    <TD>
                      <Link href={`/recognition/${r.id}`} className="text-xs font-semibold text-primary hover:underline">
                        Open
                      </Link>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          <ul className="space-y-3 md:hidden">
            {records.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/recognition/${r.id}`}
                  className="block rounded-xl border border-line bg-surface p-4 shadow-card active:bg-surface-secondary"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-display text-sm font-bold text-content">
                      {r.organization.acronym ?? r.organization.name}
                    </p>
                    <Badge tone={RECOGNITION_STATUS_META[r.status].tone}>
                      {RECOGNITION_STATUS_META[r.status].label}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-content-muted">
                    AY {r.academicYear} · {r.kind === "RENEWAL" ? "Renewal" : "Initial"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
