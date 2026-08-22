import type { Metadata } from "next";
import Link from "next/link";
import { Download, Landmark, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, scopedOrgWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { ORG_STATE_META, ORG_TYPE_LABELS } from "@/lib/constants";
import { deriveOrgState } from "@/lib/org-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/form";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";

export const metadata: Metadata = { title: "Organizations" };

type Search = { q?: string; college?: string; type?: string; state?: string };

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const [colleges, allScoped] = await Promise.all([
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
        type: true,
        status: true,
        collegeId: true,
        parentId: true,
        college: { select: { code: true, name: true } },
        parent: { select: { acronym: true, name: true } },
        recognitions: { select: { academicYear: true, status: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Enrich with member counts and derived state, then apply JS-side filters.
  const enriched = await Promise.all(
    allScoped.map(async (o) => {
      const [memberCount, childrenCount] = await Promise.all([
        db.organizationMember.count({ where: { organizationId: o.id, isCurrent: true } }),
        db.organization.count({ where: { parentId: o.id, archivedAt: null } }),
      ]);
      return { ...o, memberCount, childrenCount, state: deriveOrgState(o, o.recognitions) };
    })
  );

  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = enriched.filter((o) => {
    if (q && !`${o.name} ${o.acronym ?? ""}`.toLowerCase().includes(q)) return false;
    if (sp.college && o.collegeId !== sp.college) return false;
    if (sp.type && o.type !== sp.type) return false;
    if (sp.state && o.state !== sp.state) return false;
    return true;
  });

  const canManage = can(user, "org.manage");
  const canExport = can(user, "analytics.view");

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

      {/* Filters */}
      <form action="/organizations" className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-content-secondary">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Name or acronym…"
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
        <div className="w-44">
          <label htmlFor="type" className="mb-1 block text-xs font-medium text-content-secondary">
            Type
          </label>
          <Select id="type" name="type" defaultValue={sp.type ?? ""}>
            <option value="">Any type</option>
            {Object.entries(ORG_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No organizations found"
          description={
            q || sp.college || sp.type || sp.state
              ? "No organizations match the current filters."
              : "No organizations are visible within your scope yet."
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <TableWrap>
              <THead>
                <TH>Organization</TH>
                <TH>College</TH>
                <TH>Type</TH>
                <TH>State</TH>
                <TH className="text-right">Members</TH>
                <TH />
              </THead>
              <tbody>
                {filtered.map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <Link href={`/organizations/${o.id}`} className="font-semibold text-primary hover:underline">
                        {o.acronym ?? o.name}
                      </Link>
                      {o.acronym && (
                        <span className="block max-w-64 truncate text-xs text-content-secondary">{o.name}</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-content-secondary">{o.college.code}</TD>
                    <TD className="whitespace-nowrap text-xs text-content-secondary">
                      {ORG_TYPE_LABELS[o.type]}
                      {o.type === "CHILD" && o.parent?.acronym ? ` · ${o.parent.acronym}` : ""}
                    </TD>
                    <TD>
                      <Badge tone={ORG_STATE_META[o.state].tone}>{ORG_STATE_META[o.state].label}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums">{o.memberCount}</TD>
                    <TD>
                      <Link href={`/organizations/${o.id}`} className="text-xs font-semibold text-primary hover:underline">
                        View
                      </Link>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((o) => (
              <li key={o.id}>
                <Link href={`/organizations/${o.id}`} className="block rounded-xl border border-line bg-surface p-4 shadow-card active:bg-surface-secondary">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display text-sm font-bold text-content">
                        {o.acronym ?? o.name}
                      </p>
                      {o.acronym && <p className="truncate text-xs text-content-secondary">{o.name}</p>}
                    </div>
                    <Badge tone={ORG_STATE_META[o.state].tone}>{ORG_STATE_META[o.state].label}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-content-muted">
                    {o.college.code} · {ORG_TYPE_LABELS[o.type]} · {o.memberCount} members
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
