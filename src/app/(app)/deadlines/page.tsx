import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Pencil, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { DEADLINE_PROCESS_LABELS } from "@/lib/constants";
import { deadlineStatus } from "@/lib/deadlines";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
import { QuickActionForm } from "@/components/action-form";
import { setDeadlineActive } from "@/lib/actions/deadlines";

export const metadata: Metadata = { title: "Deadlines" };

export default async function DeadlinesPage() {
  const user = await requireUser();
  const canManage = can(user, "deadline.manage");

  const deadlines = await db.deadline.findMany({
    where: canManage ? {} : { isActive: true },
    include: { scopeCollege: { select: { code: true, name: true } }, createdBy: { select: { firstName: true, lastName: true } } },
    orderBy: [{ academicYear: "desc" }, { dueDate: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Deadlines"
        description="Official submission deadlines published by OSAS."
        actions={
          canManage && (
            <Link
              href="/deadlines/new"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
            >
              <Plus className="size-4" aria-hidden />
              New deadline
            </Link>
          )
        }
      />

      {deadlines.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No deadlines published"
          description={
            canManage
              ? "Create the first official deadline for the academic year."
              : "There are no active deadlines right now."
          }
        />
      ) : (
        <>
          <Card className="hidden md:block">
            <TableWrap>
              <THead>
                <TH>Deadline</TH>
                <TH>Process</TH>
                <TH>Academic year</TH>
                <TH>Window</TH>
                <TH>Applies to</TH>
                <TH>Status</TH>
                {canManage && <TH />}
              </THead>
              <tbody>
                {deadlines.map((d) => {
                  const st = deadlineStatus(d);
                  return (
                    <TR key={d.id} className={d.isActive ? "" : "opacity-60"}>
                      <TD>
                        <p className="font-semibold text-content">{d.name}</p>
                        {d.instructions && (
                          <p className="mt-0.5 max-w-72 truncate text-xs text-content-secondary">
                            {d.instructions}
                          </p>
                        )}
                      </TD>
                      <TD className="text-xs whitespace-nowrap text-content-secondary">
                        {DEADLINE_PROCESS_LABELS[d.process]}
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums">{d.academicYear}</TD>
                      <TD className="text-xs whitespace-nowrap text-content-secondary">
                        {formatDateTime(d.startDate)}
                        <span className="block">→ {formatDateTime(d.dueDate)}</span>
                      </TD>
                      <TD className="text-xs whitespace-nowrap text-content-secondary">
                        {d.scopeType === "ALL" ? "All organizations" : d.scopeType.toLowerCase()}
                        {d.scopeCollege ? ` · ${d.scopeCollege.code}` : ""}
                      </TD>
                      <TD>
                        {!d.isActive ? (
                          <Badge tone="neutral">Inactive</Badge>
                        ) : (
                          <Badge tone={st === "OPEN" ? "success" : st === "UPCOMING" ? "info" : "neutral"}>
                            {st === "OPEN" ? "Open" : st === "UPCOMING" ? "Upcoming" : "Closed"}
                          </Badge>
                        )}
                      </TD>
                      {canManage && (
                        <TD>
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/deadlines/${d.id}/edit`}
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-2.5 text-xs font-semibold text-content hover:border-primary hover:text-primary"
                              aria-label={`Edit ${d.name}`}
                            >
                              <Pencil className="size-3.5" aria-hidden />
                              Edit
                            </Link>
                            <QuickActionForm
                              action={setDeadlineActive}
                              hidden={{ id: d.id, isActive: String(!d.isActive) }}
                              label={d.isActive ? "Deactivate" : "Activate"}
                              variant="ghost"
                            />
                          </div>
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </tbody>
            </TableWrap>
          </Card>

          <ul className="space-y-3 md:hidden">
            {deadlines.map((d) => {
              const st = deadlineStatus(d);
              return (
                <li key={d.id}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-sm font-bold text-content">{d.name}</p>
                      <Badge tone={st === "OPEN" ? "success" : st === "UPCOMING" ? "info" : "neutral"}>
                        {st === "OPEN" ? "Open" : st === "UPCOMING" ? "Upcoming" : "Closed"}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-xs text-content-secondary">
                      {DEADLINE_PROCESS_LABELS[d.process]} · AY {d.academicYear}
                    </p>
                    <p className="mt-1 text-xs text-content-muted">
                      Due {formatDateTime(d.dueDate)}
                    </p>
                    {canManage && (
                      <Link
                        href={`/deadlines/${d.id}/edit`}
                        className="mt-3 inline-flex h-8 items-center rounded-lg border border-line-strong px-3 text-xs font-semibold text-content hover:border-primary hover:text-primary"
                      >
                        Edit
                      </Link>
                    )}
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
