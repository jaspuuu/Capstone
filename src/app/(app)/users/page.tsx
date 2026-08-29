import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { SHORT_ROLE_LABELS } from "@/lib/constants";
import { formatDateTime, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
import { QuickActionForm } from "@/components/action-form";
import { setUserActive } from "@/lib/actions/users";
export const instant = false;

export const metadata: Metadata = { title: "User accounts" };

type Search = { q?: string; role?: string; college?: string };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requirePermission("users.manage");
  const sp = await searchParams;
  const currentUser = await getSessionUser();

  const users = await db.user.findMany({
    where: {
      ...(sp.q
        ? {
            OR: [
              { email: { contains: sp.q, mode: "insensitive" as const } },
              { firstName: { contains: sp.q, mode: "insensitive" as const } },
              { lastName: { contains: sp.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(sp.role ? { role: sp.role as never } : {}),
      ...(sp.college ? { collegeId: sp.college } : {}),
    },
    include: { college: { select: { code: true } } },
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }],
  });

  const colleges = await db.college.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader
        title="User accounts"
        description="Create and manage system accounts. Roles determine permissions across the entire system."
        actions={
          <Link
            href="/users/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
          >
            <Plus className="size-4" aria-hidden />
            New account
          </Link>
        }
      />

      <form action="/users" className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-content-secondary">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Name or email…"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <div className="w-56">
          <label htmlFor="role" className="mb-1 block text-xs font-medium text-content-secondary">
            Role
          </label>
          <select id="role" name="role" defaultValue={sp.role ?? ""} className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm">
            <option value="">All roles</option>
            {Object.entries(SHORT_ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="w-44">
          <label htmlFor="college" className="mb-1 block text-xs font-medium text-content-secondary">
            College
          </label>
          <select id="college" name="college" defaultValue={sp.college ?? ""} className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm">
            <option value="">All</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-10 rounded-lg bg-primary-dark px-4 text-sm font-semibold text-white hover:bg-primary">
          Apply
        </button>
      </form>

      {users.length === 0 ? (
        <EmptyState icon={Users} title="No accounts found" description="No user accounts match the current filters." />
      ) : (
        <Card>
          <TableWrap>
            <THead>
              <TH>Account</TH>
              <TH>Role</TH>
              <TH>College</TH>
              <TH>Status</TH>
              <TH>Last sign-in</TH>
              <TH />
            </THead>
            <tbody>
              {users.map((u) => (
                <TR key={u.id} className={u.isActive ? "" : "opacity-60"}>
                  <TD>
                    <p className="font-semibold text-content">{fullName(u)}</p>
                    <p className="text-xs text-content-secondary">{u.email}</p>
                  </TD>
                  <TD>
                    <Badge tone={u.role === "OSAS" ? "primary" : u.role === "SOA" ? "info" : "neutral"}>
                      {SHORT_ROLE_LABELS[u.role]}
                    </Badge>
                    {u.isViewOnly && (
                      <span className="mt-1 block text-[11px] font-semibold text-warning">View-only</span>
                    )}
                  </TD>
                  <TD className="text-xs whitespace-nowrap text-content-secondary">
                    {u.college?.code ?? "—"}
                  </TD>
                  <TD>
                    <Badge tone={u.isActive ? "success" : "danger"} icon={!u.isActive}>
                      {u.isActive ? "Active" : "Deactivated"}
                    </Badge>
                  </TD>
                  <TD className="text-xs whitespace-nowrap text-content-secondary">
                    {formatDateTime(u.lastLoginAt)}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/users/${u.id}/edit`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-2.5 text-xs font-semibold text-content hover:border-primary hover:text-primary"
                        aria-label={`Edit ${u.email}`}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                        Edit
                      </Link>
                      {u.id !== currentUser?.id && (
                        <QuickActionForm
                          action={setUserActive}
                          hidden={{ id: u.id, isActive: String(!u.isActive) }}
                          label={u.isActive ? "Deactivate" : "Activate"}
                          variant="ghost"
                          confirmMessage={
                            u.isActive
                              ? `Deactivate ${u.email}? Their active sessions will be signed out immediately.`
                              : undefined
                          }
                        />
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
