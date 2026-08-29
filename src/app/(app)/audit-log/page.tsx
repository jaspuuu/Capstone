import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { AUDIT_ACTION_LABELS } from "@/lib/constants";
import { formatDateTime, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
export const instant = false;

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

type Search = { page?: string; action?: string; user?: string; q?: string };

function toneFor(action: string): "success" | "danger" | "info" | "neutral" {
  if (action.endsWith("_APPROVED") || action.endsWith("_CONFERRED") || action === "LOGIN") return "success";
  if (action.endsWith("_REJECTED") || action === "LOGIN_FAILED" || action.endsWith("_DEACTIVATED")) return "danger";
  if (action.startsWith("RECOGNITION_") || action.startsWith("USER_")) return "info";
  return "neutral";
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const where = {
    ...(sp.action ? { action: sp.action as never } : {}),
    ...(sp.user ? { userId: sp.user } : {}),
    ...(sp.q
      ? {
          OR: [
            { entityLabel: { contains: sp.q, mode: "insensitive" as const } },
            { entityType: { contains: sp.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [logs, total, users] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
    db.user.findMany({ where: { role: { in: ["OSAS", "SOA", "DEAN"] } }, orderBy: { lastName: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const params = new URLSearchParams();
    if (sp.action) params.set("action", sp.action);
    if (sp.user) params.set("user", sp.user);
    if (sp.q) params.set("q", sp.q);
    params.set("page", String(p));
    return `/audit-log?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Immutable record of every significant action taken in the system."
      />

      <form action="/audit-log" className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-content-secondary">
            Search records
          </label>
          <input
            id="q"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Entity label or type…"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <div className="w-64">
          <label htmlFor="action" className="mb-1 block text-xs font-medium text-content-secondary">
            Action
          </label>
          <select id="action" name="action" defaultValue={sp.action ?? ""} className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm">
            <option value="">All actions</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="w-56">
          <label htmlFor="user" className="mb-1 block text-xs font-medium text-content-secondary">
            Performed by
          </label>
          <select id="user" name="user" defaultValue={sp.user ?? ""} className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm">
            <option value="">Anyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {fullName(u)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-10 rounded-lg bg-primary-dark px-4 text-sm font-semibold text-white hover:bg-primary">
          Apply
        </button>
      </form>

      {logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit entries" description="No entries match the current filters." />
      ) : (
        <>
          <Card>
            <TableWrap>
              <THead>
                <TH>When</TH>
                <TH>Action</TH>
                <TH>Record</TH>
                <TH>Performed by</TH>
                <TH>IP address</TH>
              </THead>
              <tbody>
                {logs.map((log) => (
                  <TR key={log.id}>
                    <TD className="text-xs whitespace-nowrap text-content-secondary">
                      {formatDateTime(log.createdAt)}
                    </TD>
                    <TD>
                      <Badge tone={toneFor(log.action)}>{AUDIT_ACTION_LABELS[log.action] ?? log.action}</Badge>
                    </TD>
                    <TD className="text-xs">
                      <span className="font-semibold text-content">{log.entityLabel ?? log.entityId?.slice(0, 8)}</span>
                      <span className="block text-content-secondary">{log.entityType}</span>
                    </TD>
                    <TD className="text-xs whitespace-nowrap">
                      {log.user ? (
                        <>
                          <span className="font-medium text-content">{fullName(log.user)}</span>
                          <span className="block text-content-secondary">{log.user.email}</span>
                        </>
                      ) : (
                        <span className="text-content-muted">System</span>
                      )}
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-content-muted">{log.ipAddress ?? "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          {totalPages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={qs(page - 1)} className="rounded-lg border border-line-strong px-3 py-2 font-semibold text-content hover:border-primary hover:text-primary">
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-content-secondary">
                Page {page} of {totalPages} · {total} entries
              </span>
              {page < totalPages ? (
                <Link href={qs(page + 1)} className="rounded-lg border border-line-strong px-3 py-2 font-semibold text-content hover:border-primary hover:text-primary">
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
