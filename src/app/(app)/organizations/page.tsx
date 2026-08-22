import type { Metadata } from "next";
import Link from "next/link";
import { Download, Layers, Landmark, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, scopedOrgWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { ORG_STATE_META } from "@/lib/constants";
import { deriveOrgState } from "@/lib/org-state";
import { Badge, Chip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/form";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";

export const metadata: Metadata = { title: "Organizations" };

type Search = {
  q?: string;
  college?: string;
  state?: string;
  mp?: string; // mother-organizations page
  sp?: string; // sub/independent page
};

const MOTHERS_PER_PAGE = 5;
const SUBS_PER_PAGE = 10;

function PanelFooter({
  from,
  to,
  total,
  page,
  pages,
  label,
  prevHref,
  nextHref,
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  pages: number;
  label: string;
  prevHref: string | null;
  nextHref: string | null;
}) {
  if (total === 0) return null;
  const linkCls =
    "inline-flex h-7 items-center rounded-md border border-line-strong px-2.5 text-xs font-semibold text-content hover:border-primary hover:text-primary";
  const offCls =
    "inline-flex h-7 items-center rounded-md border border-line px-2.5 text-xs font-semibold text-content-muted opacity-60";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
      <p className="text-xs text-content-secondary">
        Showing <span className="font-semibold tabular-nums">{from}</span> to{" "}
        <span className="font-semibold tabular-nums">{to}</span> of{" "}
        <span className="font-semibold tabular-nums">{total}</span> {label}
      </p>
      <nav aria-label={`${label} pagination`} className="flex items-center gap-1.5">
        {prevHref ? (
          <Link href={prevHref} className={linkCls} rel="prev">
            Previous
          </Link>
        ) : (
          <span className={offCls} aria-disabled>
            Previous
          </span>
        )}
        <span className="px-1.5 text-xs font-medium tabular-nums text-content-secondary">
          Page {page} of {pages}
        </span>
        {nextHref ? (
          <Link href={nextHref} className={linkCls} rel="next">
            Next
          </Link>
        ) : (
          <span className={offCls} aria-disabled>
            Next
          </span>
        )}
      </nav>
    </div>
  );
}

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const [colleges, scoped] = await Promise.all([
    can(user, "college.manage") || user.role === "DEAN"
      ? db.college.findMany({
          ...(user.role === "DEAN" && user.collegeId ? { where: { id: user.collegeId } } : {}),
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    db.organization.findMany({
      where: scopedOrgWhere(user, { archivedAt: null }),
      select: {
        id: true,
        name: true,
        acronym: true,
        status: true,
        collegeId: true,
        parentId: true,
        college: { select: { code: true, name: true } },
        parent: { select: { id: true, acronym: true, name: true } },
        recognitions: { select: { academicYear: true, status: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Child counts in one grouped query — classification comes purely from
  // relationship data (parentId / children), never from names or acronyms.
  const childGroups = await db.organization.groupBy({
    by: ["parentId"],
    where: { parentId: { not: null }, archivedAt: null },
    _count: { _all: true },
  });
  const childCountOf = new Map<string, number>(
    childGroups
      .filter((g): g is typeof g & { parentId: string } => g.parentId !== null)
      .map((g) => [g.parentId, g._count._all])
  );

  const enriched = scoped.map((o) => ({
    ...o,
    state: deriveOrgState(o, o.recognitions),
    childrenCount: childCountOf.get(o.id) ?? 0,
  }));

  // Classification:
  //   mother       — has at least one linked sub-organization
  //   sub          — has a mother organization (parentId set)
  //   independent  — no mother and no children of its own
  const mothers = enriched.filter((o) => o.childrenCount > 0);
  const subsAndIndependent = enriched.filter(
    (o) => o.parentId !== null || o.childrenCount === 0
  );

  // Shared filters applied to both panels.
  const q = (sp.q ?? "").trim().toLowerCase();
  const matchesBase = (o: (typeof enriched)[number]) =>
    (!q || `${o.name} ${o.acronym ?? ""}`.toLowerCase().includes(q)) &&
    (!sp.college || o.collegeId === sp.college) &&
    (!sp.state || o.state === sp.state);

  const filteredMothers = mothers.filter(matchesBase);
  const filteredSubs = subsAndIndependent.filter(
    (o) =>
      matchesBase(o) ||
      (q && o.parent ? `${o.parent.name} ${o.parent.acronym ?? ""}`.toLowerCase().includes(q) : false)
  );

  function paginate<T>(list: T[], rawPage: string | undefined, size: number) {
    const pages = Math.max(1, Math.ceil(list.length / size));
    const page = Math.min(Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1), pages);
    return {
      slice: list.slice((page - 1) * size, page * size),
      page,
      pages,
      total: list.length,
    };
  }

  const motherView = paginate(filteredMothers, sp.mp, MOTHERS_PER_PAGE);
  const subView = paginate(filteredSubs, sp.sp, SUBS_PER_PAGE);
  const hasFilters = Boolean(q || sp.college || sp.state);

  // Builds panel/pagination URLs that preserve the shared filters and the
  // OTHER panel's current page.
  const baseParams: Record<string, string> = {};
  if (sp.q) baseParams.q = sp.q;
  if (sp.college) baseParams.college = sp.college;
  if (sp.state) baseParams.state = sp.state;

  function orgUrl(extra: Record<string, string | number>) {
    const usp = new URLSearchParams(baseParams);
    for (const [k, v] of Object.entries(extra)) if (v !== "") usp.set(k, String(v));
    const s = usp.toString();
    return s ? `/organizations?${s}` : "/organizations";
  }

  const canManage = can(user, "org.manage");
  const canExport = can(user, "analytics.view");

  const motherPrev = motherView.page > 1 ? orgUrl({ mp: motherView.page - 1 }) : null;
  const motherNext = motherView.page < motherView.pages ? orgUrl({ mp: motherView.page + 1 }) : null;
  const subPrev = subView.page > 1 ? orgUrl({ sp: subView.page - 1 }) : null;
  const subNext = subView.page < subView.pages ? orgUrl({ sp: subView.page + 1 }) : null;

  return (
    <>
      <PageHeader
        title="Organizations"
        description="All student organizations within your access scope."
        actions={
          <>
            {canExport && (
              <>
                <a
                  href="/export/organizations"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content hover:border-primary hover:text-primary"
                >
                  <Download className="size-4" aria-hidden />
                  Export CSV
                </a>
                <a
                  href="/export/organizations.xlsx"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content hover:border-primary hover:text-primary"
                >
                  <Download className="size-4" aria-hidden />
                  Excel
                </a>
              </>
            )}
            {canManage && (
              <Link
                href="/organizations/new"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
              >
                <Plus className="size-4" aria-hidden />
                New organization
              </Link>
            )}
          </>
        }
      />

      {/* Shared search + filters — apply to BOTH panels */}
      <form action="/organizations" className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-content-secondary">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Name, acronym, or mother organization…"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
        {colleges.length > 0 && (
          <div className="w-48">
            <label htmlFor="college" className="mb-1 block text-xs font-medium text-content-secondary">
              College
            </label>
            <Select id="college" name="college" defaultValue={sp.college ?? ""}>
              <option value="">All colleges</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-48">
          <label htmlFor="state" className="mb-1 block text-xs font-medium text-content-secondary">
            Recognition state
          </label>
          <Select id="state" name="state" defaultValue={sp.state ?? ""}>
            <option value="">Any state</option>
            {Object.entries(ORG_STATE_META).map(([v, m]) => (
              <option key={v} value={v}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg bg-primary-dark px-4 text-sm font-semibold text-white hover:bg-primary"
        >
          Apply
        </button>
        <Link
          href="/organizations"
          className="h-10 inline-flex items-center rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content"
        >
          Reset
        </Link>
      </form>

      {/* Two-panel layout: mothers left, subs/independent right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* LEFT — Mother Organizations */}
        <Card className="self-start overflow-hidden lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Landmark className="size-4 shrink-0 text-primary" aria-hidden />
                <h2 className="font-display text-base font-bold tracking-tight text-content">
                  Mother Organizations
                </h2>
                <Chip>{mothers.length}</Chip>
              </div>
              <p className="mt-0.5 text-xs text-content-muted">
                Organizations that have sub-organizations.
              </p>
            </div>
          </div>

          {motherView.total === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No Mother Organizations found."
              description={
                hasFilters
                  ? "None match the current filters."
                  : "No organization currently has linked sub-organizations."
              }
              className="border-0"
              action={
                hasFilters ? (
                  <Link
                    href="/organizations"
                    className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-xs font-semibold text-primary hover:border-primary"
                  >
                    Reset filters
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <TableWrap>
                <THead>
                  <TH>Organization</TH>
                  <TH>College</TH>
                  <TH className="text-center">Sub-Orgs</TH>
                  <TH>Recognition State</TH>
                  <TH />
                </THead>
                <tbody>
                  {motherView.slice.map((o) => (
                    <TR key={o.id}>
                      <TD>
                        <Link
                          href={`/organizations/${o.id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {o.acronym ?? o.name}
                        </Link>
                        {o.acronym && (
                          <span className="block max-w-56 truncate text-xs text-content-secondary">
                            {o.name}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <span className="whitespace-nowrap font-medium">{o.college.code}</span>
                        <span className="block max-w-32 truncate text-xs text-content-muted">
                          {o.college.name}
                        </span>
                      </TD>
                      <TD className="text-center tabular-nums">{o.childrenCount}</TD>
                      <TD>
                        <Badge tone={ORG_STATE_META[o.state].tone}>
                          {ORG_STATE_META[o.state].label}
                        </Badge>
                      </TD>
                      <TD>
                        <Link
                          href={`/organizations/${o.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          View
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </TableWrap>
              <PanelFooter
                from={(motherView.page - 1) * MOTHERS_PER_PAGE + 1}
                to={Math.min(motherView.page * MOTHERS_PER_PAGE, motherView.total)}
                total={motherView.total}
                page={motherView.page}
                pages={motherView.pages}
                label="mother organizations"
                prevHref={motherPrev}
                nextHref={motherNext}
              />
            </>
          )}
        </Card>

        {/* RIGHT — Sub-Organizations / Independent Organizations */}
        <Card className="self-start overflow-hidden lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Layers className="size-4 shrink-0 text-primary" aria-hidden />
                <h2 className="font-display text-base font-bold tracking-tight text-content">
                  Sub-Organizations / Independent Organizations
                </h2>
                <Chip>{subsAndIndependent.length}</Chip>
              </div>
              <p className="mt-0.5 text-xs text-content-muted">
                Organizations that are under a mother organization or operate independently.
              </p>
            </div>
          </div>

          {subView.total === 0 ? (
            <EmptyState
              icon={Layers}
              title="No Sub-Organizations or Independent Organizations found."
              description={
                hasFilters
                  ? "None match the current filters."
                  : "No organizations in this category are visible within your scope yet."
              }
              className="border-0"
              action={
                hasFilters ? (
                  <Link
                    href="/organizations"
                    className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-xs font-semibold text-primary hover:border-primary"
                  >
                    Reset filters
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <TableWrap>
                <THead>
                  <TH>Organization</TH>
                  <TH>Mother Organization</TH>
                  <TH>College</TH>
                  <TH>Recognition State</TH>
                  <TH />
                </THead>
                <tbody>
                  {subView.slice.map((o) => (
                    <TR key={o.id}>
                      <TD>
                        <Link
                          href={`/organizations/${o.id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {o.acronym ?? o.name}
                        </Link>
                        {o.acronym && (
                          <span className="block max-w-56 truncate text-xs text-content-secondary">
                            {o.name}
                          </span>
                        )}
                      </TD>
                      <TD>
                        {o.parent ? (
                          <Link
                            href={`/organizations/${o.parent.id}`}
                            className="max-w-40 truncate font-medium text-content hover:text-primary hover:underline"
                            title={o.parent.name}
                          >
                            {o.parent.acronym ?? o.parent.name}
                          </Link>
                        ) : (
                          <Chip className="italic">Independent</Chip>
                        )}
                      </TD>
                      <TD>
                        <span className="whitespace-nowrap font-medium">{o.college.code}</span>
                        <span className="block max-w-32 truncate text-xs text-content-muted">
                          {o.college.name}
                        </span>
                      </TD>
                      <TD>
                        <Badge tone={ORG_STATE_META[o.state].tone}>
                          {ORG_STATE_META[o.state].label}
                        </Badge>
                      </TD>
                      <TD>
                        <Link
                          href={`/organizations/${o.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          View
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </TableWrap>
              <PanelFooter
                from={(subView.page - 1) * SUBS_PER_PAGE + 1}
                to={Math.min(subView.page * SUBS_PER_PAGE, subView.total)}
                total={subView.total}
                page={subView.page}
                pages={subView.pages}
                label="organizations"
                prevHref={subPrev}
                nextHref={subNext}
              />
            </>
          )}
        </Card>
      </div>
    </>
  );
}
