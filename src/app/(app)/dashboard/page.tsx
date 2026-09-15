import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileSignature,
  Landmark,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { isAdminRole } from "@/lib/auth/rbac";
import { isOfficerPosition } from "@/lib/auth/positions";
import type { Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getSelectedAy } from "@/lib/ay-server";
import { getSelectedOrgId } from "@/lib/org-server";
import { formatDate, formatDateTime, fullName, timeAgo, timeUntil } from "@/lib/utils";
import {
  AUDIT_ACTION_LABELS,
  ATTENDANCE_STATUS_META,
  DEADLINE_PROCESS_LABELS,
  MEMBER_POSITION_LABELS,
  MEMBERSHIP_STATUS_META,
  ORG_APPLICATION_STATUS_META,
  ORG_STATE_META,
  PROPOSAL_STATUS_META,
  RECOGNITION_STATUS_META,
  type BadgeTone,
} from "@/lib/constants";
import { deadlineStatus, listActiveDeadlines } from "@/lib/deadlines";
import { deriveOrgState } from "@/lib/org-state";
import { FORM_META, SIGNATORY_LABELS } from "@/lib/form-routes";
import {
  ACTIVITY_WORKFLOW,
  currentAction,
  inFlightStatuses,
  ORG_APPLICATION_WORKFLOW,
  RECOGNITION_WORKFLOW,
} from "@/lib/workflow";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DashboardBriefing } from "@/components/dashboard-briefing";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
import { SignatureQueueCard } from "@/components/forms/signature-queue-card";
import { getSignatureQueue } from "@/lib/signature-queue";
import { getMyTasks } from "@/lib/tasks";
import { OfficerActionRequired, type ActionItem } from "@/components/dashboard/officer-action-required";
import { OfficerStatusSummary, type StatusCell } from "@/components/dashboard/officer-status-summary";
import { OfficerContext, type OfficerContextMembership } from "@/components/dashboard/officer-context";
import { orgAppCompliancePct, orgAppRequirements } from "@/lib/org-application";
export const instant = false;

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const ay = await getSelectedAy();

  if (isAdminRole(user.role)) return <AdminDashboard user={user} ay={ay} />;
  if (user.role === "DEAN") return <DeanDashboard user={user} ay={ay} />;
  if (user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME") {
    return <AdviserDashboard user={user} ay={ay} />;
  }
  // Plain members get the self-service participant surface — officers
  // (President/Secretary memberships) keep the officer workspace below.
  if (user.role === "MEMBER") return <MemberDashboard user={user} ay={ay} />;
  return <OfficerDashboard user={user} ay={ay} />;
}

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

async function AdminDashboard({
  user,
  ay,
}: {
  user: { id: string; firstName: string; role: string };
  ay: string;
}) {
  const [orgs, recognitions, deadlines, recentLogs, followUps] = await Promise.all([
    db.organization.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        acronym: true,
        status: true,
        applicationStatus: true,
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
    db.recognitionFollowUp.findMany({
      where: { status: { in: ["PENDING", "CONTACTED", "OVERDUE"] } },
      include: {
        recognition: {
          select: {
            id: true,
            academicYear: true,
            organization: { select: { id: true, name: true, acronym: true } },
          },
        },
      },
      orderBy: { expectedDate: "asc" },
      take: 6,
    }),
  ]);

  const states = orgs.map((o) => deriveOrgState(o, o.recognitions));
  const countStates = (s: string) => states.filter((x) => x === s).length;

  // §6/§28: the in-flight creation chain (adviser → dean → SOA → OSAS) is as
  // much the reviewer's queue as recognition — surface both to OSAS. Applied
  // memberships are officer-reviewed per org, but OSAS needs campus sight of
  // the acceptance queue (read-only; officers act on their org pages).
  const [pendingQueue, orgApplications, memberApplications, signatureQueue] = await Promise.all([
    db.recognition.findMany({
      where: { academicYear: ay, status: { in: inFlightStatuses(RECOGNITION_WORKFLOW) } },
      include: {
        organization: { select: { id: true, name: true, acronym: true } },
      },
      orderBy: { submittedAt: "asc" },
      take: 6,
    }),
    db.organization.findMany({
      where: {
        archivedAt: null,
        applicationStatus: { in: inFlightStatuses(ORG_APPLICATION_WORKFLOW) },
      },
      select: {
        id: true,
        name: true,
        acronym: true,
        applicationStatus: true,
        college: { select: { name: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 6,
    }),
    db.organizationMember.findMany({
      where: {
        academicYear: ay,
        status: "APPLIED",
        organization: { archivedAt: null },
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        organization: { select: { id: true, name: true, acronym: true } },
      },
      orderBy: { joinedAt: "asc" },
      take: 6,
    }),
    getSignatureQueue({ role: user.role as Role, id: user.id }, { ay }),
  ]);

  const recognizedCount = countStates("RECOGNIZED");
  const inFlight = inFlightStatuses(RECOGNITION_WORKFLOW);
  const pendingCount = recognitions.filter((r) => inFlight.includes(r.status)).length;

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
      <DashboardBriefing
        title={`${greeting()}, ${user.firstName}`}
        description="System overview across organizations, recognition, and review queues."
        rubric={`Office briefing · AY ${ay}`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Organizations" value={orgs.length} icon={Landmark} hint={`${countStates("INACTIVE")} inactive`} href="/organizations" />
        <StatCard label="Recognized" value={recognizedCount} icon={Award} iconTone="gold" hint={`AY ${ay}`} />
        <StatCard label="Pending reviews" value={pendingCount} icon={ClipboardCheck} iconTone="warning" hint="Applications awaiting action" href="/recognition" />
        <StatCard label="Follow-ups due" value={followUps.length} icon={CalendarClock} iconTone={followUps.length > 0 ? "orange" : "info"} hint="One week after submission" href="/recognition" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={ClipboardCheck}
            title="Pending actions"
            description="Work in flight across organization creation, recognition, and membership"
            actions={
              <div className="flex items-center gap-3">
                <Link href="/organizations" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  Organizations <ArrowRight className="size-3.5" aria-hidden />
                </Link>
                <Link href="/recognition" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  Recognition <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            }
          />
          {orgApplications.length === 0 && pendingQueue.length === 0 && memberApplications.length === 0 ? (
            <EmptyState
              title="All caught up"
              description="No applications are waiting for review right now."
              className="border-0"
            />
          ) : (
            <>
              {orgApplications.length > 0 && (
                <section aria-label="Organization applications" className="border-t border-line">
                  <p className="px-5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-content-secondary">
                    Organization applications
                  </p>
                  <TableWrap>
                    <THead>
                      <TH>Organization</TH>
                      <TH>Responsible</TH>
                      <TH>Status</TH>
                      <TH />
                    </THead>
                    <tbody>
                      {orgApplications.map((o) => {
                        const gate = currentAction(ORG_APPLICATION_WORKFLOW, o.applicationStatus);
                        return (
                          <TR key={o.id}>
                            <TD>
                              <Link href={`/organizations/${o.id}`} className="font-semibold text-primary hover:underline">
                                {o.acronym ?? o.name}
                              </Link>
                              <span className="block text-xs text-content-secondary">{o.college.name}</span>
                            </TD>
                            <TD className="text-xs text-content-secondary">{gate?.roleLabel ?? "—"}</TD>
                            <TD>
                              <Badge tone={ORG_APPLICATION_STATUS_META[o.applicationStatus].tone}>
                                {ORG_APPLICATION_STATUS_META[o.applicationStatus].label}
                              </Badge>
                            </TD>
                            <TD>
                              <Link href={`/organizations/${o.id}`} className="text-xs font-semibold text-primary hover:underline">
                                Review
                              </Link>
                            </TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </TableWrap>
                </section>
              )}
              {pendingQueue.length > 0 && (
                <section aria-label="Recognition applications" className="border-t border-line">
                  <p className="px-5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-content-secondary">
                    Recognition applications
                  </p>
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
                            <Link href={`/organizations/${r.organization.id}/accreditation`} className="font-semibold text-primary hover:underline">
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
                            <Link href={`/organizations/${r.organization.id}/accreditation`} className="text-xs font-semibold text-primary hover:underline">
                              Review
                            </Link>
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </TableWrap>
                </section>
              )}
              {memberApplications.length > 0 && (
                <section aria-label="Membership applications" className="border-t border-line">
                  <p className="px-5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-content-secondary">
                    Membership applications
                  </p>
                  <TableWrap>
                    <THead>
                      <TH>Applicant</TH>
                      <TH>Organization</TH>
                      <TH>Submitted</TH>
                      <TH />
                    </THead>
                    <tbody>
                      {memberApplications.map((m) => (
                        <TR key={m.id}>
                          <TD>
                            <p className="text-sm font-semibold text-content">
                              {m.user.firstName} {m.user.lastName}
                            </p>
                            <p className="text-xs text-content-secondary">Awaiting officer review</p>
                          </TD>
                          <TD>
                            <Link href={`/organizations/${m.organization.id}`} className="font-semibold text-primary hover:underline">
                              {m.organization.acronym ?? m.organization.name}
                            </Link>
                            <span className="block text-xs text-content-secondary">{m.organization.name}</span>
                          </TD>
                          <TD className="text-xs whitespace-nowrap text-content-secondary">
                            {formatDate(m.joinedAt)}
                          </TD>
                          <TD>
                            <Link href={`/organizations/${m.organization.id}`} className="text-xs font-semibold text-primary hover:underline">
                              Review
                            </Link>
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </TableWrap>
                </section>
              )}
              {followUps.length > 0 && (
                <section aria-label="Follow-ups due" className="border-t border-line">
                  <p className="px-5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-content-secondary">
                    Follow-ups due (one week after submission)
                  </p>
                  <TableWrap>
                    <THead>
                      <TH>Organization</TH>
                      <TH>Cycle</TH>
                      <TH>Expected</TH>
                      <TH>Status</TH>
                      <TH />
                    </THead>
                    <tbody>
                      {followUps.map((f) => {
                        const overdue = new Date() > f.expectedDate;
                        return (
                          <TR key={f.id}>
                            <TD>
                              <Link href={`/organizations/${f.recognition.organization.id}/accreditation`} className="font-semibold text-primary hover:underline">
                                {f.recognition.organization.acronym ?? f.recognition.organization.name}
                              </Link>
                            </TD>
                            <TD className="text-xs text-content-secondary">AY {f.recognition.academicYear}</TD>
                            <TD className="text-xs whitespace-nowrap text-content-secondary">
                              {formatDate(f.expectedDate)}
                              {overdue && <span className="ml-1.5 font-bold text-danger">overdue</span>}
                            </TD>
                            <TD>
                              <Badge tone={overdue ? "danger" : "warning"}>
                                {overdue ? "Overdue" : "Due"}
                              </Badge>
                            </TD>
                            <TD>
                              <Link href={`/organizations/${f.recognition.organization.id}/accreditation`} className="text-xs font-semibold text-primary hover:underline">
                                Follow up
                              </Link>
                            </TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </TableWrap>
                </section>
              )}
            </>
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

          <SignatureQueueCard items={signatureQueue} compact />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader icon={FileSignature} title="Recent system activity" description="Latest audited actions across the system" />
        <Timeline items={logItems} />
      </Card>
    </>
  );
}

async function DeanDashboard({ user, ay }: { user: { id: string; collegeId: string | null; firstName: string }; ay: string }) {
  const collegeId = user.collegeId;
  const [orgs, pending, deadlines] = await Promise.all([
    db.organization.findMany({
      where: { archivedAt: null, collegeId: collegeId ?? "__none__" },
      select: {
        id: true, name: true, acronym: true, status: true, applicationStatus: true, collegeId: true, type: true,
        recognitions: { select: { academicYear: true, status: true } },
      },
    }),
    db.recognition.findMany({
      where: {
        academicYear: ay,
        status: { in: inFlightStatuses(RECOGNITION_WORKFLOW) },
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
      <DashboardBriefing
        title={`${greeting()}, Dean ${user.firstName}`}
        description="Overview of student organizations under your college for this academic year."
        rubric={`College briefing · AY ${ay}`}
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
                    <Link href={`/organizations/${r.organization.id}/accreditation`} className="truncate text-sm font-semibold text-primary hover:underline">
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

async function AdviserDashboard({ user, ay }: { user: { id: string; firstName: string }; ay: string }) {
  const assignments = await db.adviserAssignment.findMany({
    where: { adviserId: user.id, isCurrent: true },
    include: {
      organization: {
        select: {
          id: true, name: true, acronym: true, status: true, applicationStatus: true, collegeId: true, type: true,
          recognitions: { select: { academicYear: true, status: true } },
        },
      },
    },
  });

  const deadlines = await listActiveDeadlines();

  // §6/§28: only the current REGULAR (senior) adviser is responsible for
  // recognition starts/reviews and activity endorsements — PART_TIME advisers
  // are excluded exactly as the server actions enforce. SF signature steps,
  // however, are type-aware (SENIOR vs JUNIOR), so those are scoped per org.
  const seniorAssignments = assignments.filter((a) => a.type === "REGULAR");
  const seniorOrgIds = seniorAssignments.map((a) => a.organizationId);
  const allOrgIds = [...new Set(assignments.map((a) => a.organizationId))];
  const orgIdTypes = new Map(assignments.map((a) => [a.organizationId, a.type]));
  const orgInfo = new Map(
    assignments.map((a) => [
      a.organizationId,
      { acronym: a.organization.acronym ?? a.organization.name, name: a.organization.name },
    ])
  );
  const [pendingRecognitions, pendingProposals, signingRoutes] =
    seniorOrgIds.length > 0
      ? await Promise.all([
          db.recognition.findMany({
            where: {
              academicYear: ay,
              status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
              organizationId: { in: seniorOrgIds },
            },
            include: { organization: { select: { id: true, name: true, acronym: true } } },
            orderBy: { submittedAt: "asc" },
          }),
          db.activityProposal.findMany({
            where: { status: "SUBMITTED", organizationId: { in: seniorOrgIds } },
            include: { organization: { select: { id: true, name: true, acronym: true } } },
            orderBy: { submittedAt: "asc" },
          }),
          db.signatureRoute.findMany({
            where: {
              entityType: "SF",
              OR: allOrgIds.map((orgId) => ({ entityId: { endsWith: `:${orgId}:${ay}` } })),
            },
            include: { steps: { orderBy: { order: "asc" } } },
          }),
        ])
      : [[], [], []];

  type PendingItem = {
    id: string;
    href: string;
    orgHref: string;
    orgAcronym: string;
    orgName: string;
    kind: string;
    detail: string;
    statusLabel: string;
    statusTone: BadgeTone;
    roleLabel: string;
    action: string;
  };

  const pendingItems: PendingItem[] = [];
  for (const r of pendingRecognitions) {
    const gate = currentAction(RECOGNITION_WORKFLOW, r.status);
    pendingItems.push({
      id: r.id,
      href: `/organizations/${r.organization.id}/accreditation`,
      orgHref: `/organizations/${r.organization.id}`,
      orgAcronym: r.organization.acronym ?? r.organization.name,
      orgName: r.organization.name,
      kind: r.kind === "RENEWAL" ? "Recognition renewal" : "Recognition application",
      detail: `AY ${r.academicYear}`,
      statusLabel: RECOGNITION_STATUS_META[r.status].label,
      statusTone: RECOGNITION_STATUS_META[r.status].tone,
      roleLabel: gate?.roleLabel ?? "—",
      action: gate?.action ?? "Review",
    });
  }
  for (const p of pendingProposals) {
    const gate = currentAction(ACTIVITY_WORKFLOW, p.status);
    pendingItems.push({
      id: p.id,
      href: `/activities/${p.id}`,
      orgHref: `/organizations/${p.organization.id}`,
      orgAcronym: p.organization.acronym ?? p.organization.name,
      orgName: p.organization.name,
      kind: "Activity proposal",
      detail: p.title,
      statusLabel: PROPOSAL_STATUS_META[p.status].label,
      statusTone: PROPOSAL_STATUS_META[p.status].tone,
      roleLabel: gate?.roleLabel ?? "—",
      action: gate?.action ?? "Review",
    });
  }

  // §28: SF signature routes where this adviser is the CURRENT signatory
  // (step role must match their assignment type), e.g. "SF-002 is waiting on
  // the Senior Adviser". Routes are lazy — a missing route means not started.
  for (const route of signingRoutes) {
    if (route.state !== "IN_PROGRESS") continue;
    const current = route.steps.find((s) => s.status === "CURRENT");
    if (!current) continue;
    const [, routeOrgId] = route.entityId.split(":");
    const adviserType = orgIdTypes.get(routeOrgId ?? "");
    const expectedRole =
      adviserType === "REGULAR"
        ? ("SENIOR_ADVISER" as const)
        : adviserType === "PART_TIME"
          ? ("JUNIOR_ADVISER" as const)
          : null;
    if (!expectedRole || current.role !== expectedRole) continue;
    const meta = FORM_META[route.formKey as keyof typeof FORM_META];
    if (!meta) continue;
    const info = orgInfo.get(routeOrgId ?? "") ?? { acronym: "", name: "" };
    pendingItems.push({
      id: route.id,
      href: `${meta.href}?org=${routeOrgId}&ay=${encodeURIComponent(ay)}`,
      orgHref: `/organizations/${routeOrgId}`,
      orgAcronym: info.acronym,
      orgName: info.name,
      kind: `Signature · ${meta.code}`,
      detail: meta.title,
      statusLabel: "Awaiting your signature",
      statusTone: "warning",
      roleLabel: SIGNATORY_LABELS[current.role],
      action: "Review & sign",
    });
  }

  return (
    <>
      <DashboardBriefing
        title={`${greeting()}, ${user.firstName}`}
        description="Organizations where you serve as faculty adviser."
        rubric={`Adviser briefing · AY ${ay}`}
      />

      {pendingItems.length > 0 && (
        <Card className="mb-6">
          <CardHeader
            icon={ClipboardCheck}
            title="Awaiting your action"
            description="Documents awaiting the adviser's review or signature"
          />
          <TableWrap>
            <THead>
              <TH>Document</TH>
              <TH>Organization</TH>
              <TH>Status</TH>
              <TH>Next step</TH>
              <TH />
            </THead>
            <tbody>
              {pendingItems.map((it) => (
                <TR key={it.id}>
                  <TD>
                    <p className="text-sm font-semibold text-content">{it.kind}</p>
                    <p className="truncate text-xs text-content-secondary">{it.detail}</p>
                  </TD>
                  <TD>
                    <Link href={it.orgHref} className="font-semibold text-primary hover:underline">
                      {it.orgAcronym}
                    </Link>
                    <span className="block max-w-52 truncate text-xs text-content-secondary">{it.orgName}</span>
                  </TD>
                  <TD>
                    <Badge tone={it.statusTone}>{it.statusLabel}</Badge>
                  </TD>
                  <TD className="text-xs text-content-secondary">
                    <span className="block font-semibold text-content">{it.roleLabel}</span>
                    {it.action}
                  </TD>
                  <TD>
                    <Link href={it.href} className="text-xs font-semibold text-primary hover:underline">
                      Act now
                    </Link>
                  </TD>
                </TR>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

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

async function OfficerDashboard({ user, ay }: { user: { id: string; firstName: string; role: string; collegeId: string | null }; ay: string }) {
  const memberships = await db.organizationMember.findMany({
    where: { userId: user.id, isCurrent: true, academicYear: ay },
    include: {
      organization: {
        select: {
          id: true, name: true, acronym: true, description: true, status: true, applicationStatus: true, collegeId: true, type: true,
          college: { select: { name: true, code: true } },
          recognitions: {
            orderBy: { academicYear: "desc" },
            select: { id: true, academicYear: true, status: true, kind: true },
          },
        },
      },
    },
  });

  // Officer orgs first: the workspace centers on organizations this user
  // cycles. Every officer seat (incl. org-specific OTHER) counts.
  const officerMemberships = memberships.filter(
    (m) => isOfficerPosition(m.position) || m.position === "OTHER"
  );
  // A topbar organization selection overrides the default workspace — the
  // dashboard (status, tasks, deadlines, activity) scopes to it.
  const selectedOrgId = await getSelectedOrgId();
  const workspaceScoped = selectedOrgId !== null && memberships.some((m) => m.organizationId === selectedOrgId);
  const primary = workspaceScoped
    ? memberships.find((m) => m.organizationId === selectedOrgId)!
    : officerMemberships[0];

  // Plain members (no officer seat) see a straightforward membership list.
  if (officerMemberships.length === 0) {
    return (
      <>
        <DashboardBriefing
          title={`${greeting()}, ${user.firstName}`}
          description="Your organization and participation."
          rubric={`Member briefing · AY ${ay}`}
        />
        {memberships.length === 0 ? (
          <EmptyState
            title="No organization membership"
            description="You are not currently listed in any student organization. Reach out to your organization officers or the OSAS office."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {memberships.map((m) => {
              const org = m.organization;
              const state = deriveOrgState(org, org.recognitions);
              return (
                <Card key={m.id}>
                  <CardHeader icon={Landmark} title={org.name} description={`${MEMBER_POSITION_LABELS[m.position] ?? "Member"} · ${org.college.code}`} />
                  <CardContent className="flex items-center justify-between gap-3">
                    <Badge tone={ORG_STATE_META[state].tone}>{ORG_STATE_META[state].label}</Badge>
                    <Link
                      href={`/organizations/${org.id}`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-3 text-xs font-semibold text-content hover:border-primary hover:text-primary"
                    >
                      Open <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </>
    );
  }

  // ---- Officer work queue for the primary organization ----
  const workOrg = primary.organization;
  const workState = deriveOrgState(workOrg, workOrg.recognitions);
  const currentRec = workOrg.recognitions.find((r) => r.academicYear === ay);
  const myTasks = await getMyTasks(
    { id: user.id, role: user.role as Role, collegeId: user.collegeId },
    { orgId: workspaceScoped ? selectedOrgId! : undefined }
  );

  const [primaryDetail, activities, recentLogs, deadlines, appliedMembers] = await Promise.all([
    db.organization.findUnique({
      where: { id: workOrg.id },
      select: {
        description: true,
        advisers: {
          where: { isCurrent: true },
          select: {
            type: true,
            academicYear: true,
            adviser: {
              select: { id: true, firstName: true, lastName: true, email: true, positionTitle: true },
            },
          },
        },
        members: { where: { isCurrent: true }, select: { academicYear: true, position: true } },
      },
    }),
    db.activityProposal.findMany({
      where: { organizationId: workOrg.id },
      select: { id: true, title: true, status: true, startAt: true },
    }),
    db.auditLog.findMany({
      where: { newState: { path: ["orgId"], string_contains: workOrg.id } },
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
    listActiveDeadlines(),
    db.organizationMember.findMany({
      where: { organizationId: workOrg.id, academicYear: ay, status: "APPLIED" },
      select: {
        id: true,
        joinedAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { joinedAt: "asc" },
      take: 5,
    }),
  ]);

  const activeAdvisers = primaryDetail?.advisers ?? [];
  const activeMembers = primaryDetail?.members ?? [];
  const memberCount = activeMembers.filter((m) => m.academicYear === ay).length;
  const pendingApprovals = appliedMembers.length;
  const requirementItems = orgAppRequirements({
    name: workOrg.name,
    description: primaryDetail?.description ?? null,
    hasSeniorAdviser: activeAdvisers.some((a) => a.type === "REGULAR" && a.academicYear === ay),
    hasPresident: activeMembers.some((m) => m.position === "PRESIDENT" && m.academicYear === ay),
    hasSecretary: activeMembers.some((m) => m.position === "SECRETARY" && m.academicYear === ay),
    activeMemberCount: memberCount,
  });
  const reqMet = requirementItems.filter((i) => i.met).length;
  const reqPct = orgAppCompliancePct(requirementItems);
  const unmet = requirementItems.filter((i) => !i.met);
  const isOfficerHere = primary.position === "PRESIDENT" || primary.position === "SECRETARY";

  // ---- ACTION REQUIRED — assembled server-side, only what needs THIS user ----
  const actionItems: ActionItem[] = [];
  for (const t of myTasks) {
    if (t.type === "SIGNATURE") {
      actionItems.push({
        id: `sig-${t.routeId ?? `${t.formKey}-${t.orgId}`}`,
        kind: "signature",
        title: `Sign ${t.formCode} — ${t.formTitle}`,
        subtitle: t.requiredRole ? `${SIGNATORY_LABELS[t.requiredRole] ?? t.requiredRole} is next in this document chain` : "Your signature is next in this document chain",
        org: t.orgAcronym ? `${t.orgName} (${t.orgAcronym})` : t.orgName,
        href: t.href,
        cta: "Review & sign",
      });
    } else if (t.type === "RESUBMIT") {
      actionItems.push({
        id: `resubmit-${t.routeId ?? `${t.formKey}-${t.orgId}`}`,
        kind: "resubmit",
        title: `${t.formCode} — ${t.formTitle}`,
        subtitle: "OSAS returned the document — review the remarks, correct it, and resubmit",
        org: t.orgAcronym ? `${t.orgName} (${t.orgAcronym})` : t.orgName,
        href: t.href,
        cta: "Fix submission",
      });
    }
  }
  if (pendingApprovals > 0 && isOfficerHere) {
    actionItems.push({
      id: `members-${workOrg.id}`,
      kind: "application",
      title: "Approve membership applications",
      subtitle: `${pendingApprovals} student application${pendingApprovals === 1 ? "" : "s"} ${pendingApprovals === 1 ? "is" : "are"} waiting for your review`,
      org: workOrg.acronym ?? workOrg.name,
      href: `/organizations/${workOrg.id}`,
      cta: "Review",
    });
  }
  if (unmet.length > 0 && (workOrg.applicationStatus === "DRAFT" || workOrg.applicationStatus === "RETURNED")) {
    actionItems.push({
      id: `req-${workOrg.id}`,
      kind: "requirements",
      title: "Application profile incomplete",
      subtitle: `${unmet.length} prerequisite${unmet.length === 1 ? "" : "s"} remain${unmet.length === 1 ? "s" : ""} before the application can be filed`,
      org: workOrg.acronym ?? workOrg.name,
      href: `/organizations/${workOrg.id}/accreditation`,
      cta: "Complete",
    });
  }

  // ---- Compact status summary ----
  const statusCells: StatusCell[] = [
    {
      label: "Recognition",
      value: currentRec ? RECOGNITION_STATUS_META[currentRec.status].label : "Not filed",
      hint: `${ORG_STATE_META[workState].label} · AY ${ay}`,
      href: `/organizations/${workOrg.id}/accreditation`,
    },
    {
      label: "Prerequisites",
      value: `${reqMet}/${requirementItems.length}`,
      hint: `${reqPct}% of the application checklist complete`,
      progress: reqPct,
      href: `/organizations/${workOrg.id}/accreditation`,
    },
    {
      label: "Membership",
      value: `${memberCount}`,
      hint: pendingApprovals > 0 ? `${pendingApprovals} pending application${pendingApprovals === 1 ? "" : "s"}` : "No pending applications",
      href: `/organizations/${workOrg.id}`,
    },
  ];

  // ---- Deadlines (recognition/renewal, scoped to this org) ----
  const relevantDeadlines = deadlines
    .filter(
      (d) =>
        (d.process === "RECOGNITION" || d.process === "RENEWAL") &&
        (!d.scopeCollegeId || d.scopeCollegeId === workOrg.collegeId) &&
        (d.scopeType === "ALL" || d.scopeType === workOrg.type) &&
        deadlineStatus(d) !== "CLOSED"
    )
    .slice(0, 4);

  // ---- Upcoming activities (real list, never a zero-KPI) ----
  const now = new Date();
  const upcomingActivities = activities
    .filter((a) => a.status === "APPROVED" && a.startAt > now)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .slice(0, 3);

  // ---- Recent activity (compact) ----
  const logItems: TimelineItem[] = recentLogs.map((l) => ({
    id: l.id,
    title: AUDIT_ACTION_LABELS[l.action] ?? l.action,
    meta: timeAgo(l.createdAt),
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

  const membershipChips: OfficerContextMembership[] = memberships.map((m) => ({
    orgId: m.organizationId,
    name: m.organization.name,
    acronym: m.organization.acronym,
    positionLabel: MEMBER_POSITION_LABELS[m.position] ?? "Member",
  }));

  return (
    <>
      <DashboardBriefing
        title={`${greeting()}, ${user.firstName}`}
        description="Your personal work queue — what needs you right now, and what is happening next."
        rubric={`Officer briefing · AY ${ay}`}
      />

      <div className="space-y-6">
        <OfficerContext
          orgName={workOrg.name}
          orgAcronym={workOrg.acronym}
          orgHref={`/organizations/${workOrg.id}`}
          positionLabel={MEMBER_POSITION_LABELS[primary.position] ?? primary.position}
          ay={ay}
          collegeLabel={workOrg.college?.name}
          recognitionLabel={currentRec ? RECOGNITION_STATUS_META[currentRec.status].label : "Not filed"}
          recognitionTone={currentRec ? RECOGNITION_STATUS_META[currentRec.status].tone : "neutral"}
          recognitionDetail={currentRec ? null : `No application record for this academic year`}
          memberships={membershipChips}
          activeOrgId={workOrg.id}
        />

        <OfficerActionRequired items={actionItems} />

        <OfficerStatusSummary cells={statusCells} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader icon={CalendarClock} title="Upcoming deadlines" description="Recognition and renewal windows affecting this organization" />
            <CardContent className="p-0">
              {relevantDeadlines.length === 0 ? (
                <p className="px-5 py-6 text-sm text-content-muted">None published for your organization.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {relevantDeadlines.map((d) => {
                    const st = deadlineStatus(d);
                    const t = timeUntil(d.dueDate);
                    const daysLeft = t.days;
                    const tone = st === "OPEN" ? (daysLeft <= 7 ? "danger" : daysLeft <= 14 ? "warning" : "info") : "info";
                    return (
                      <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-content">{d.name}</p>
                          <p className="mt-0.5 text-xs text-content-secondary">{formatDate(d.dueDate)}</p>
                        </div>
                        <div className="text-right">
                          <Badge tone={tone}>
                            {st === "OPEN"
                              ? daysLeft > 0
                                ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining`
                                : `Due today`
                              : `Opens ${formatDate(d.startDate)}`}
                          </Badge>
                          <p className="mt-1 text-[11px] text-content-muted">
                            {DEADLINE_PROCESS_LABELS[d.process]} · AY {d.academicYear}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader icon={CalendarDays} title="Upcoming activities" description="Approved activities for this organization" />
            <CardContent className="p-0">
              {upcomingActivities.length === 0 ? (
                <p className="px-5 py-6 text-sm text-content-muted">No upcoming activities.</p>
              ) : (
                <>
                  <ul className="divide-y divide-line">
                    {upcomingActivities.map((a) => (
                      <li key={a.id} className="px-5 py-3.5">
                        <p className="truncate text-sm font-semibold text-content">{a.title}</p>
                        <p className="mt-0.5 text-xs text-content-secondary">{formatDateTime(a.startAt)}</p>
                        <p className="mt-1 text-[11px] font-semibold text-success">Approved</p>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-line px-5 py-3">
                    <Link
                      href={`/organizations/${workOrg.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      View activities <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader icon={RefreshCw} title="Recent activity" description={`Latest updates for ${workOrg.acronym ?? workOrg.name}`} />
            {logItems.length > 0 ? (
              <Timeline items={logItems} className="py-3" />
            ) : (
              <CardContent>
                <p className="text-sm text-content-muted">No recent activity recorded for this organization.</p>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </>
);
}

async function MemberDashboard({ user, ay }: { user: { id: string; firstName: string; role: string; collegeId: string | null }; ay: string }) {
  const memberships = await db.organizationMember.findMany({
    where: { userId: user.id, isCurrent: true, academicYear: ay },
    include: {
      organization: {
        select: {
          id: true, name: true, acronym: true, description: true, applicationStatus: true, status: true, collegeId: true, type: true,
          college: { select: { name: true, code: true } },
          recognitions: {
            orderBy: { academicYear: "desc" },
            select: { id: true, academicYear: true, status: true, kind: true },
          },
        },
      },
    },
    orderBy: [{ status: "asc" }, { organization: { name: "asc" } }],
  });

  const orgIds = memberships.map((m) => m.organizationId);
  const pendingApplications = memberships.filter((m) => ["APPLIED", "UNDER_REVIEW"].includes(m.status));
  const joined = memberships.filter((m) => ["ACTIVE", "APPROVED"].includes(m.status));

  const [upcomingActivities, attendanceRecords] = await Promise.all([
    orgIds.length === 0
      ? []
      : db.activityProposal.findMany({
          where: { organizationId: { in: orgIds }, status: "APPROVED", startAt: { gte: new Date() } },
          select: {
            id: true, title: true, venue: true, startAt: true,
            organization: { select: { name: true, acronym: true } },
          },
          orderBy: { startAt: "asc" },
          take: 5,
        }),
    db.activityAttendance.findMany({
      where: { userId: user.id },
      include: {
        activity: {
          select: {
            id: true, title: true, startAt: true,
            organization: { select: { name: true, acronym: true } },
          },
        },
      },
      orderBy: { recordedAt: "desc" },
      take: 5,
    }),
  ]);

  const attendanceCounts = attendanceRecords.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <DashboardBriefing
        title={`${greeting()}, ${user.firstName}`}
        description="Your organizations, upcoming activities, and participation record."
        rubric={`Member briefing · AY ${ay}`}
      />

      {pendingApplications.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {pendingApplications.map((m) => (
            <Card key={m.id}>
              <CardHeader icon={UserPlus} title={m.organization.name} description="Your application is awaiting officer review." />
              <CardContent className="flex items-center justify-between gap-3">
                <Badge tone={MEMBERSHIP_STATUS_META[m.status]?.tone ?? "warning"}>
                  {MEMBERSHIP_STATUS_META[m.status]?.label ?? m.status}
                </Badge>
                <Link
                  href={`/organizations/${m.organizationId}`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-3 text-xs font-semibold text-content hover:border-primary hover:text-primary"
                >
                  View <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {joined.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={pendingApplications.length > 0 ? "Application in review" : "Join a student organization"}
          description={
            pendingApplications.length > 0
              ? "Your application is in the officers' hands. You'll see your membership here once it is approved."
              : "You are not currently listed in any student organization. Find a recognized organization and apply to join."
          }
          action={pendingApplications.length === 0 && (
            <Link
              href="/organizations"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              Find organizations <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {joined.map((m) => {
            const org = m.organization;
            const state = deriveOrgState(org, org.recognitions);
            return (
              <Card key={m.id}>
                <CardHeader icon={Landmark} title={org.name} description={`${MEMBER_POSITION_LABELS[m.position] ?? "Member"} · ${org.college.code}`} />
                <CardContent className="flex items-center justify-between gap-3">
                  <Badge tone={ORG_STATE_META[state].tone}>{ORG_STATE_META[state].label}</Badge>
                  <Link
                    href={`/organizations/${org.id}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-3 text-xs font-semibold text-content hover:border-primary hover:text-primary"
                  >
                    Open <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={CalendarDays} title="Upcoming activities" description="Approved activities for your organizations." />
          <CardContent>
            {upcomingActivities.length === 0 ? (
              <p className="py-6 text-center text-sm text-content-muted">No upcoming approved activities for your organizations.</p>
            ) : (
              <ul className="divide-y divide-line">
                {upcomingActivities.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-content">{a.title}</p>
                      <p className="mt-0.5 text-xs text-content-secondary">
                        {a.organization.acronym ?? a.organization.name}
                        {a.venue ? ` · ${a.venue}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-content-secondary">{formatDateTime(a.startAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/calendar"
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover"
            >
              View activity calendar <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader icon={CalendarCheck} title="My attendance" description="Your recent participation record." />
          <CardContent>
            {attendanceRecords.length === 0 ? (
              <p className="py-6 text-center text-sm text-content-muted">No attendance recorded yet.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {Object.entries(ATTENDANCE_STATUS_META).map(([status, meta]) => (
                    <div key={status} className="rounded-lg border border-line p-3">
                      <p className="font-display text-2xl font-bold text-content">{attendanceCounts[status] ?? 0}</p>
                      <p className="mt-0.5 text-xs font-semibold text-content-secondary">{meta.label}</p>
                    </div>
                  ))}
                </div>
                <ul className="mt-4 divide-y divide-line">
                  {attendanceRecords.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-content">{r.activity.title}</p>
                        <p className="text-xs text-content-muted">{r.activity.organization.acronym ?? r.activity.organization.name}</p>
                      </div>
                      <Badge tone={ATTENDANCE_STATUS_META[r.status]?.tone ?? "neutral"}>
                        {ATTENDANCE_STATUS_META[r.status]?.label ?? r.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/my/attendance"
                  className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover"
                >
                  View full attendance <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
