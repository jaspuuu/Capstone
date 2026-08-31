import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleDot, FileCheck2 } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, orgScopeWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { getSelectedAy } from "@/lib/ay-server";
import { MONITORING_STATUS_META, SEMESTER_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, semesterOf } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
import { MonitoringForm } from "../monitoring-form";
export const instant = false;

export const metadata: Metadata = { title: "Activity monitoring" };

type MonitoringStatusKey = "IMPLEMENTED" | "NOT_IMPLEMENTED" | "RESCHEDULED";

const DOT: Record<MonitoringStatusKey | "NONE", string> = {
  IMPLEMENTED: "bg-success",
  NOT_IMPLEMENTED: "bg-danger",
  RESCHEDULED: "bg-warning",
  NONE: "bg-content-muted",
};

export default async function OrganizationMonitoringPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sem?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const sem: 1 | 2 = sp.sem === "2" ? 2 : 1;

  const org = await db.organization.findFirst({
    where: { AND: [orgScopeWhere(user), { id }] },
    select: {
      id: true,
      name: true,
      acronym: true,
      collegeId: true,
      college: { select: { name: true } },
      members: {
        where: { isCurrent: true },
        select: {
          userId: true,
          position: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      advisers: {
        where: { isCurrent: true },
        select: { adviserId: true, adviser: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (!org) notFound();

  const ay = await getSelectedAy();

  const activities = await db.activityProposal.findMany({
    where: { organizationId: id, status: "APPROVED", academicYear: ay },
    include: {
      monitoring: {
        include: { updatedBy: { select: { firstName: true, lastName: true } } },
      },
      report: { select: { id: true, status: true } },
    },
    orderBy: { startAt: "asc" },
  });

  const nameById = new Map<string, string>();
  for (const m of org.members) {
    nameById.set(m.userId, `${m.user.firstName} ${m.user.lastName}`.trim());
  }
  for (const a of org.advisers) {
    nameById.set(a.adviserId, `${a.adviser.firstName} ${a.adviser.lastName}`.trim());
  }

  const canManage = can(user, "org.manage");
  const canRecord =
    canManage ||
    (user.role === "DEAN" && org.collegeId === user.collegeId) ||
    org.members.some(
      (m) => m.userId === user.id && (m.position === "PRESIDENT" || m.position === "SECRETARY")
    ) ||
    org.advisers.some((a) => a.adviserId === user.id);

  const officers = org.members
    .filter((m) => m.position === "PRESIDENT" || m.position === "SECRETARY")
    .map((m) => ({ userId: m.userId, name: nameById.get(m.userId) ?? "Officer" }));
  const regularMembers = org.members
    .filter((m) => m.position === "MEMBER")
    .map((m) => ({ userId: m.userId, name: nameById.get(m.userId) ?? "Member" }));
  const advisers = org.advisers.map((a) => ({
    userId: a.adviserId,
    name: nameById.get(a.adviserId) ?? "Adviser",
  }));

  const rows = activities.filter((a) => semesterOf(a.startAt) === sem);
  const counts = {
    total: rows.length,
    IMPLEMENTED: rows.filter((r) => r.monitoring?.status === "IMPLEMENTED").length,
    NOT_IMPLEMENTED: rows.filter((r) => r.monitoring?.status === "NOT_IMPLEMENTED").length,
    RESCHEDULED: rows.filter((r) => r.monitoring?.status === "RESCHEDULED").length,
    pending: rows.filter((r) => !r.monitoring).length,
  };

  return (
    <>
      <PageHeader
        title="Activity Monitoring"
        description={`${org.name} · AY ${ay} · ${SEMESTER_LABELS[sem]}`}
        breadcrumb={[{ label: org.acronym ?? org.name, href: `/organizations/${org.id}` }, { label: "Monitoring" }]}
        actions={
          <Link
            href={`/organizations/${org.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to organization
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {[1, 2].map((s) => {
          const active = sem === s;
          const semesterCount = activities.filter((a) => semesterOf(a.startAt) === (s as 1 | 2)).length;
          return (
            <Link
              key={s}
              href={`/organizations/${org.id}/monitoring?sem=${s}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-sm font-semibold ${
                active
                  ? "border-primary bg-primary text-white shadow-sm"
                  : "border-line-strong bg-surface text-content hover:border-primary hover:text-primary"
              }`}
            >
              {SEMESTER_LABELS[s as 1 | 2]}
              <span
                className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                  active ? "bg-white/20 text-white" : "bg-surface-secondary text-content-secondary"
                }`}
              >
                {semesterCount}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <ChipCount label="Total activities" value={counts.total} dotClass={null} />
        <ChipCount label="Implemented" value={counts.IMPLEMENTED} dotClass={DOT.IMPLEMENTED} />
        <ChipCount label="Not implemented" value={counts.NOT_IMPLEMENTED} dotClass={DOT.NOT_IMPLEMENTED} />
        <ChipCount label="Rescheduled" value={counts.RESCHEDULED} dotClass={DOT.RESCHEDULED} />
        <ChipCount label="Pending" value={counts.pending} dotClass={DOT.NONE} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No activities to monitor"
          description="No approved activities this semester. Once proposals are approved they appear here for monitoring."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <TableWrap>
              <THead>
                <TH>Activity</TH>
                <TH>Target date</TH>
                <TH>Responsible</TH>
                <TH>Status</TH>
                <TH>Action</TH>
              </THead>
              <tbody>
                {rows.map((a) => {
                  const mon = a.monitoring;
                  const status: MonitoringStatusKey | "NONE" = mon?.status ?? "NONE";
                  const rescheduleCount = Array.isArray(mon?.rescheduleHistory) ? (mon!.rescheduleHistory as unknown[]).length : 0;
                  const responsible = (mon?.responsibleMemberIds as string[] | null) ?? [];
                  const responsibleNames = responsible.map((uid) => nameById.get(uid)).filter(Boolean).slice(0, 3);
                  const hasReport = a.report != null;
                  return (
                    <TR key={a.id}>
                      <TD>
                        <Link href={`/activities/${a.id}`} className="font-semibold text-content hover:text-primary">
                          {a.title}
                        </Link>
                        {a.venue && <p className="text-xs text-content-secondary">{a.venue}</p>}
                      </TD>
                      <TD className="text-xs whitespace-nowrap text-content-secondary">
                        {formatDate(a.startAt)}
                        {mon?.rescheduledTo && (
                          <span className="block font-medium text-warning">
                            → {formatDate(mon.rescheduledTo)}
                            {rescheduleCount > 0 && ` (${rescheduleCount}×)`}
                          </span>
                        )}
                      </TD>
                      <TD className="text-xs text-content-secondary">
                        {responsibleNames.length > 0 ? (
                          <>
                            {responsibleNames.join(", ")}
                            {responsible.length > responsibleNames.length && ` +${responsible.length - responsibleNames.length}`}
                            {mon?.responsibleNote && <p className="mt-0.5 text-content-muted">{mon.responsibleNote}</p>}
                          </>
                        ) : mon?.responsibleNote ? (
                          mon.responsibleNote
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className={`size-2 rounded-full ${DOT[status]}`} aria-hidden />
                          <Badge tone={status === "NONE" ? "neutral" : MONITORING_STATUS_META[status].tone}>
                            {status === "NONE" ? "No outcome" : MONITORING_STATUS_META[status].label}
                          </Badge>
                        </div>
                        {mon?.updatedBy && (
                          <p className="mt-0.5 text-[11px] text-content-muted">
                            {formatDateTime(mon.updatedAt)} · {`${mon.updatedBy.firstName} ${mon.updatedBy.lastName}`.trim()}
                          </p>
                        )}
                      </TD>
                      <TD>
                        {hasReport ? (
                          <Link
                            href={`/reports/${a.report!.id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                          >
                            <CircleDot className="size-3.5" aria-hidden />
                            View report
                          </Link>
                        ) : canRecord ? (
                          <details className="group">
                            <summary className="cursor-pointer text-xs font-semibold text-primary hover:underline">
                              {mon ? "Update outcome" : "Record outcome"}
                            </summary>
                            <div className="mt-3 rounded-xl border border-line p-4">
                              <MonitoringForm
                                activityId={a.id}
                                activityTitle={a.title}
                                initialStatus={mon?.status}
                                initialReason={mon?.reason}
                                initialRescheduledTo={mon?.rescheduledTo}
                                initialResponsibleNote={mon?.responsibleNote}
                                initialResponsibleIds={responsible}
                                officers={officers}
                                members={regularMembers}
                                advisers={advisers}
                              />
                            </div>
                          </details>
                        ) : (
                          <span className="text-xs text-content-muted">—</span>
                        )}
                        {!hasReport && status === "IMPLEMENTED" && (
                          <span className="mt-1.5 block text-[11px] text-content-muted">
                            Report filing unlocked
                          </span>
                        )}
                        {!hasReport && (status === "NOT_IMPLEMENTED" || status === "RESCHEDULED") && (
                          <span className="mt-1.5 block text-[11px] text-content-muted">
                            Report unlocks when marked Implemented
                          </span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </TableWrap>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function ChipCount({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: number;
  dotClass: string | null;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3">
      {dotClass ? (
        <span className={`size-2.5 rounded-full ${dotClass}`} aria-hidden />
      ) : (
        <span className="size-2.5 rounded-full bg-primary" aria-hidden />
      )}
      <div>
        <p className="text-lg leading-5 font-bold tabular-nums text-content">{value}</p>
        <p className="text-xs text-content-secondary">{label}</p>
      </div>
    </div>
  );
}