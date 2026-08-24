import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  CalendarClock,
  ClipboardCheck,
  FileSignature,
  Landmark,
  RefreshCw,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { isAdminRole } from "@/lib/auth/rbac";
import type { Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getSelectedAy } from "@/lib/ay-server";
import { formatDateTime, fullName, timeUntil } from "@/lib/utils";
import {
  AUDIT_ACTION_LABELS,
  DEADLINE_PROCESS_LABELS,
  ORG_STATE_META,
  RECOGNITION_STATUS_META,
  SHORT_ROLE_LABELS,
} from "@/lib/constants";
import { deadlineStatus, listActiveDeadlines } from "@/lib/deadlines";
import { deriveOrgState } from "@/lib/org-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const ay = await getSelectedAy();

  if (isAdminRole(user.role)) return <AdminDashboard user={user} ay={ay} />;
  if (user.role === "DEAN") return <DeanDashboard user={user} ay={ay} />;
  if (user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME") {
    return <AdviserDashboard user={user} ay={ay} />;
  }
  return <OfficerDashboard user={user} ay={ay} />;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function DeadlineList({
  deadlines,
  emptyText = "No upcoming deadlines.",
}: {
  deadlines: Awaited<ReturnType<typeof import("@/lib/deadlines").listActiveDeadlines>>;
  emptyText?: string;
}) {
  if (deadlines.length === 0) {
    return <p className="px-5 py-6 text-sm text-content-muted">{emptyText}</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {deadlines.slice(0, 5).map((d) => {
        const status = deadlineStatus(d);
        const t = timeUntil(d.dueDate);
        return (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-content">{d.name}</p>
              <p className="mt-0.5 text-xs text-content-secondary">
                {DEADLINE_PROCESS_LABELS[d.process]} · AY {d.academicYear}
                {"scopeCollege" in d && d.scopeCollege ? ` · ${d.scopeCollege.code}` : ""}
              </p>
            </div>
            <div className="text-right">
              <Badge tone={status === "OPEN" ? "success" : status === "UPCOMING" ? "info" : "neutral"}>
                {status === "OPEN"
                  ? `Due in ${t.days > 0 ? `${t.days}d` : `${t.hours}h`}`
                  : status === "UPCOMING"
                    ? "Upcoming"
                    : "Closed"}
              </Badge>
              <p className="mt-1 text-[11px] text-content-muted">
                {formatDateTime(d.dueDate)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// OSAS / SOA
// ---------------------------------------------------------------------------

async function AdminDashboard({
  user,
  ay,
}: {
  user: { id: string; firstName: string; role: string };
  ay: string;
}) {
  const [orgs, recognitions, deadlines, recentLogs] = await Promise.all([
    db.organization.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        acronym: true,
        status: true,
        collegeId: true,
        type: true,
        recognitions: { select: { academicYear: true, status: true } },
      },
    }),
    db.recognition.findMany({
      where: { academicYear: ay },
      select: { status: true },
    }),
    listActiveDeadlines(),
    db.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const states = orgs.map((o) => deriveOrgState(o, o.recognitions));
  const countStates = (s: string) => states.filter((x) => x === s).length;

  const pendingQueue = await db.recognition.findMany({
    where: { academicYear: ay, status: { in: ["SUBMITTED", "UNDER_REVIEW", "FOR_APPROVAL"] } },
    include: {
      organization: { select: { id: true, name: true, acronym: true } },
    },
    orderBy: { submittedAt: "asc" },
    take: 6,
  });

  const recognizedCount = countStates("RECOGNIZED");
  const pendingCount = recognitions.filter((r) =>
    ["SUBMITTED", "UNDER_REVIEW", "FOR_APPROVAL"].includes(r.status)
  ).length;

  // Distribution bars for org states.
  const distribution = (["RECOGNIZED", "PENDING_RENEWAL", "ACTIVE", "EXPIRED", "REJECTED", "INACTIVE"] as const)
    .map((s) => ({ state: s, count: countStates(s) }))
    .filter((x) => x.count > 0);

  const logItems: TimelineItem[] = recentLogs.map((l) => ({
    id: l.id,
    title: AUDIT_ACTION_LABELS[l.action] ?? l.action,
    meta: formatDateTime(l.createdAt),
    actor: l.user ? fullName(l.user) : "System",
    tone:
      l.action.includes("APPROVED") || l.action === "RECOGNITION_CONFERRED"
        ? "success"
        : l.action.includes("REJECTED")
          ? "danger"
          : l.action.includes("SUBMITTED")
            ? "warning"
            : "neutral",
  }));

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.firstName}`}
        description={`System overview for Academic Year ${ay}.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Organizations" value={orgs.length} icon={Landmark} hint={`${countStates("INACTIVE")} inactive`} href="/organizations" />
        <StatCard label="Recognized" value={recognizedCount} icon={Award} iconTone="gold" hint={`AY ${ay}`} />
        <StatCard label="Pending reviews" value={pendingCount} icon={ClipboardCheck} iconTone="warning" hint="Applications awaiting action" href="/recognition" />
        <StatCard label="Active deadlines" value={deadlines.filter((d) => deadlineStatus(d) !== "CLOSED").length} icon={CalendarClock} iconTone="info" href="/deadlines" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={ClipboardCheck}
            title="Pending actions"
            description="Applications that need review or approval"
            actions={
              <Link href="/recognition" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                View all <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {pendingQueue.length === 0 ? (
            <EmptyState
              title="All caught up"
              description="No applications are waiting for review right now."
              className="border-0"
            />
          ) : (
            <TableWrap>
              <THead>
                <TH>Organization</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH>Submitted</TH>
                <TH />
              </THead>
              <tbody>
                {pendingQueue.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/recognition/${r.id}`} className="font-semibold text-primary hover:underline">
                        {r.organization.acronym ?? r.organization.name}
                      </Link>
                      <span className="block text-xs text-content-secondary">{r.organization.name}</span>
                    </TD>
                    <TD className="text-content-secondary">{r.kind === "RENEWAL" ? "Renewal" : "Initial"}</TD>
                    <TD>
                      <Badge tone={RECOGNITION_STATUS_META[r.status].tone}>
                        {RECOGNITION_STATUS_META[r.status].label}
                      </Badge>
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-content-secondary">
                      {formatDateTime(r.submittedAt)}
                    </TD>
                    <TD>
                      <Link href={`/recognition/${r.id}`} className="text-xs font-semibold text-primary hover:underline">
                        Review
                      </Link>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={Landmark} title="Organization states" description={`AY ${ay}`} />
            <CardContent className="space-y-3">
              {distribution.map(({ state, count }) => (
                <div key={state}>
                  <div className="mb-1 flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-1.5 text-content-secondary">
                      <span className={`size-2 rounded-full ${state === "RECOGNIZED" ? "bg-gold" : ""}`} aria-hidden />
                      {ORG_STATE_META[state].label}
                    </span>
                    <span className="text-content">{count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
                    <div
                      className={
                        state === "RECOGNIZED"
                          ? "h-full rounded-full bg-gold"
                          : state === "PENDING_RENEWAL"
                            ? "h-full rounded-full bg-warning"
                            : state === "REJECTED"
                              ? "h-full rounded-full bg-danger"
                              : state === "ACTIVE"
                                ? "h-full rounded-full bg-success"
                                : "h-full rounded-full bg-content-muted"
                      }
                      style={{ width: `${Math.round((count / Math.max(1, orgs.length)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              icon={CalendarClock}
              title="Deadlines"
              actions={
                <Link href="/deadlines" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  Manage <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <DeadlineList deadlines={deadlines} emptyText="No active deadlines published." />
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader icon={FileSignature} title="Recent system activity" description="Latest audited actions across the system" />
        <Timeline items={logItems} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Dean
// ---------------------------------------------------------------------------

async function DeanDashboard({ user, ay }: { user: { id: string; collegeId: string | null; firstName: string }; ay: string }) {
  const collegeId = user.collegeId;
  const [orgs, pending, deadlines] = await Promise.all([
    db.organization.findMany({
      where: { archivedAt: null, collegeId: collegeId ?? "__none__" },
      select: {
        id: true, name: true, acronym: true, status: true, collegeId: true, type: true,
        recognitions: { select: { academicYear: true, status: true } },
      },
    }),
    db.recognition.findMany({
      where: {
        academicYear: ay,
        status: { in: ["SUBMITTED", "UNDER_REVIEW", "FOR_APPROVAL"] },
        organization: { collegeId: collegeId ?? "__none__" },
      },
      include: { organization: { select: { id: true, name: true, acronym: true } } },
      orderBy: { submittedAt: "asc" },
    }),
    listActiveDeadlines(),
  ]);

  const states = orgs.map((o) => deriveOrgState(o, o.recognitions));

  return (
    <>
      <PageHeader
        title={`${greeting()}, Dean ${user.firstName}`}
        description={`Overview of student organizations under your college for AY ${ay}.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Organizations" value={orgs.length} icon={Landmark} href="/organizations" />
        <StatCard label="Recognized" value={states.filter((s) => s === "RECOGNIZED").length} icon={Award} iconTone="gold" />
        <StatCard label="For review" value={pending.length} icon={ClipboardCheck} iconTone="warning" hint="Within your college" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={ClipboardCheck} title="Applications in your college" />
          {pending.length === 0 ? (
            <EmptyState title="Nothing to review" description="No pending applications from your college." className="border-0" />
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <Link href={`/recognition/${r.id}`} className="truncate text-sm font-semibold text-primary hover:underline">
                      {r.organization.name}
                    </Link>
                    <p className="text-xs text-content-secondary">{r.kind === "RENEWAL" ? "Renewal" : "Initial application"} · AY {r.academicYear}</p>
                  </div>
                  <Badge tone={RECOGNITION_STATUS_META[r.status].tone}>{RECOGNITION_STATUS_META[r.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader icon={CalendarClock} title="University deadlines" />
          <DeadlineList deadlines={deadlines} />
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Advisers
// ---------------------------------------------------------------------------

async function AdviserDashboard({ user, ay }: { user: { id: string; firstName: string }; ay: string }) {
  const assignments = await db.adviserAssignment.findMany({
    where: { adviserId: user.id, isCurrent: true },
    include: {
      organization: {
        select: {
          id: true, name: true, acronym: true, status: true, collegeId: true, type: true,
          recognitions: { select: { academicYear: true, status: true } },
        },
      },
    },
  });

  const deadlines = await listActiveDeadlines();

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.firstName}`}
        description="Organizations where you serve as faculty adviser."
      />

      {assignments.length === 0 ? (
        <EmptyState
          title="No advisory assignments"
          description="You have not been assigned as an adviser to any organization for the current academic year."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assignments.map((a) => {
            const state = deriveOrgState(a.organization, a.organization.recognitions);
            const currentRec = a.organization.recognitions.find((r) => r.academicYear === ay);
            return (
              <Card key={a.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/organizations/${a.organization.id}`} className="font-display text-base font-bold text-primary hover:underline">
                      {a.organization.acronym ?? a.organization.name}
                    </Link>
                    <p className="truncate text-xs text-content-secondary">{a.organization.name}</p>
                  </div>
                  <Badge tone={ORG_STATE_META[state].tone}>{ORG_STATE_META[state].label}</Badge>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
                  <span className="text-content-secondary">AY {ay} application</span>
                  {currentRec ? (
                    <Badge tone={RECOGNITION_STATUS_META[currentRec.status].tone}>
                      {RECOGNITION_STATUS_META[currentRec.status].label}
                    </Badge>
                  ) : (
                    <span className="text-content-muted">Not filed</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader icon={CalendarClock} title="University deadlines" />
        <DeadlineList deadlines={deadlines} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Officers & members
// ---------------------------------------------------------------------------

async function OfficerDashboard({ user, ay }: { user: { id: string; firstName: string; role: string }; ay: string }) {
  const memberships = await db.organizationMember.findMany({
    where: { userId: user.id, isCurrent: true },
    include: {
      organization: {
        select: {
          id: true, name: true, acronym: true, description: true, status: true, collegeId: true, type: true,
          college: { select: { name: true, code: true } },
          recognitions: {
            orderBy: { academicYear: "desc" },
            select: { id: true, academicYear: true, status: true, kind: true },
          },
        },
      },
    },
  });

  const isOfficer = user.role === "PRESIDENT" || user.role === "SECRETARY";
  const deadlines = await listActiveDeadlines();

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.firstName}`}
        description={isOfficer ? "Manage your organization's recognition and submissions." : "Your organization and participation."}
      />

      {memberships.length === 0 ? (
        <EmptyState
          title="No organization membership"
          description="You are not currently listed in any student organization. Reach out to your organization officers or the OSAS office."
        />
      ) : (
        <div className="space-y-6">
          {memberships.map((m) => {
            const org = m.organization;
            const state = deriveOrgState(org, org.recognitions);
            const currentRec = org.recognitions.find((r) => r.academicYear === ay);
            const latestRec = org.recognitions[0];
            const relevantDeadlines = deadlines.filter(
              (d) =>
                (d.process === "RECOGNITION" || d.process === "RENEWAL") &&
                (!d.scopeCollegeId || d.scopeCollegeId === org.collegeId) &&
                (d.scopeType === "ALL" || d.scopeType === org.type)
            );
            return (
              <Card key={m.id}>
                <CardHeader
                  icon={Landmark}
                  title={org.name}
                  description={`${org.college.code} · ${SHORT_ROLE_LABELS[user.role as Role]} · AY ${ay}`}
                  actions={
                    <Link
                      href={`/organizations/${org.id}`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-3 text-xs font-semibold text-content hover:border-primary hover:text-primary"
                    >
                      Open profile <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  }
                />
                <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">Recognition state</p>
                    <div className="mt-2"><Badge tone={ORG_STATE_META[state].tone}>{ORG_STATE_META[state].label}</Badge></div>
                    {latestRec && (
                      <p className="mt-2 text-xs text-content-muted">
                        Latest record: AY {latestRec.academicYear} ·{" "}
                        {RECOGNITION_STATUS_META[latestRec.status].label}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
                      AY {ay} application
                    </p>
                    <div className="mt-2">
                      {currentRec ? (
                        <Link href={`/recognition/${currentRec.id}`}>
                          <Badge tone={RECOGNITION_STATUS_META[currentRec.status].tone}>
                            {RECOGNITION_STATUS_META[currentRec.status].label}
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-sm text-content-muted">Not yet filed</span>
                      )}
                    </div>
                    {isOfficer && !currentRec && (
                      <Link
                        href={`/recognition/new?organizationId=${org.id}&kind=${latestRec && latestRec.status === "RECOGNIZED" ? "RENEWAL" : "INITIAL"}`}
                        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover"
                      >
                        {latestRec?.status === "RECOGNIZED" ? (
                          <><RefreshCw className="size-3.5" aria-hidden /> Start renewal</>
                        ) : (
                          <><Award className="size-3.5" aria-hidden /> Apply for recognition</>
                        )}
                      </Link>
                    )}
                    {isOfficer && currentRec && ["DRAFT", "RETURNED"].includes(currentRec.status) && (
                      <Link
                        href={`/recognition/${currentRec.id}`}
                        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-gold px-3 text-xs font-semibold text-primary-dark hover:bg-gold-dark hover:text-white"
                      >
                        <FileSignature className="size-3.5" aria-hidden /> Complete submission
                      </Link>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">Relevant deadlines</p>
                    <ul className="mt-2 space-y-2">
                      {relevantDeadlines.length === 0 && (
                        <li className="text-sm text-content-muted">None published.</li>
                      )}
                      {relevantDeadlines.slice(0, 3).map((d) => {
                        const st = deadlineStatus(d);
                        return (
                          <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate font-medium text-content">{d.name}</span>
                            <Badge tone={st === "OPEN" ? "success" : st === "UPCOMING" ? "info" : "neutral"}>
                              {st === "OPEN" ? `Due ${formatDateTime(d.dueDate)}` : st === "UPCOMING" ? "Upcoming" : "Closed"}
                            </Badge>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
