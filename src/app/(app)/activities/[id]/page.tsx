import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import {
  ACTIVITY_SCOPE_LABELS,
  AUDIT_ACTION_LABELS,
  PROPOSAL_STATUS_META,
} from "@/lib/constants";
import { ACTIVITY_STEPS, activityStepIndex } from "@/lib/org-state";
import { formatDateTime, formatMoney, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { WorkflowSteps } from "@/components/ui/progress";
import { ActionForm } from "@/components/action-form";
import { AttachmentsCard } from "@/components/attachments-card";
import { AttendanceCard } from "@/components/attendance-card";
import {
  canManageAttendance,
  attendanceAllowedStatus,
} from "@/lib/attendance-access";
import { canManageAttachments } from "@/lib/attachment-access";
import {
  approveActivity,
  endorseActivity,
  rejectActivity,
  returnActivity,
  submitActivity,
} from "@/lib/actions/activities";
import type { ActionState } from "@/lib/actions/activities";

export const metadata: Metadata = { title: "Activity proposal" };

type Panel = {
  key: string;
  title: string;
  description?: string;
  needNote?: boolean;
  noteLabel?: string;
  variant: "primary" | "gold" | "danger" | "outline";
  submitLabel: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
};

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const proposal = await db.activityProposal.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          college: true,
          members: { where: { isCurrent: true }, select: { userId: true, position: true } },
        },
      },
      report: { select: { id: true, status: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!proposal) notFound();

  // Scope enforcement mirrors recognition: non-admins must be connected.
  if (!can(user, "org.manage") && user.role !== "DEAN") {
    const isMember = proposal.organization.members.some((m) => m.userId === user.id);
    const isAdviser =
      (user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME")
        ? await db.adviserAssignment.findFirst({
            where: { adviserId: user.id, organizationId: proposal.organizationId, isCurrent: true },
          })
        : null;
    if (!isMember && !isAdviser) notFound();
  }
  if (
    user.role === "DEAN" &&
    !can(user, "org.manage") &&
    proposal.organization.collegeId !== user.collegeId
  ) {
    notFound();
  }

  const isOfficer =
    (user.role === "PRESIDENT" || user.role === "SECRETARY") &&
    proposal.organization.members.some((m) => m.userId === user.id);
  const isAdmin = can(user, "org.manage");
  const isAdviser =
    (user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME")
      ? Boolean(
          await db.adviserAssignment.findFirst({
            where: { adviserId: user.id, organizationId: proposal.organizationId, isCurrent: true },
          })
        )
      : false;

  const meta = PROPOSAL_STATUS_META[proposal.status];
  const stepIndex = activityStepIndex(proposal.phase ?? "PLAN");
  const active = !user.isViewOnly;

  // ---- Available actions ---------------------------------------------------
  const panels: Panel[] = [];
  if (active && isOfficer && ["DRAFT", "RETURNED"].includes(proposal.status)) {
    panels.push({
      key: "submit",
      title: proposal.status === "RETURNED" ? "Resubmit proposal" : "Submit proposal",
      description:
        proposal.status === "RETURNED" && proposal.remarks
          ? "Returned with feedback — address it before resubmitting."
          : "Submit to the adviser for endorsement.",
      variant: "primary",
      submitLabel: proposal.status === "RETURNED" ? "Resubmit" : "Submit",
      action: submitActivity,
    });
  }
  if (active && (isAdviser || isAdmin) && proposal.status === "SUBMITTED") {
    panels.push(
      {
        key: "endorse",
        title: "Endorse proposal",
        description: "Recommend this activity for approval.",
        variant: "primary",
        submitLabel: "Endorse",
        action: endorseActivity,
      },
      {
        key: "return",
        title: "Return to organization",
        needNote: true,
        noteLabel: "What needs to be corrected or added?",
        variant: "outline",
        submitLabel: "Return with note",
        action: returnActivity,
      }
    );
  }
  if (
    active &&
    can(user, "activity.approve") &&
    ["SUBMITTED", "ENDORSED"].includes(proposal.status)
  ) {
    const deanScoped = user.role === "DEAN";
    const inScope =
      !deanScoped ||
      (proposal.scope !== "UNIVERSITY" &&
        proposal.organization.collegeId === user.collegeId);
    if (inScope && proposal.status === "ENDORSED") {
      panels.push(
        {
          key: "approve",
          title: "Approve proposal",
          description: `Approve this ${ACTIVITY_SCOPE_LABELS[proposal.scope].toLowerCase()} activity.`,
          variant: "primary",
          submitLabel: "Approve",
          action: approveActivity,
        },
        {
          key: "reject",
          title: "Reject proposal",
          needNote: true,
          noteLabel: "Reason for rejection",
          variant: "danger",
          submitLabel: "Reject",
          action: rejectActivity,
        }
      );
    }
  }

  const history = await db.auditLog.findMany({
    where: { entityType: "ActivityProposal", entityId: proposal.id },
    include: { user: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  });

  const timelineItems: TimelineItem[] = history.map((h) => ({
    id: h.id,
    title: AUDIT_ACTION_LABELS[h.action] ?? h.action,
    meta: formatDateTime(h.createdAt),
    actor: h.user ? fullName(h.user) : "System",
    body:
      h.newState && typeof h.newState === "object" && "note" in (h.newState as Record<string, unknown>)
        ? String((h.newState as Record<string, unknown>).note ?? "")
        : null,
    tone:
      h.action === "ACTIVITY_APPROVED" || h.action === "ACTIVITY_COMPLETED"
        ? ("success" as const)
        : h.action === "ACTIVITY_REJECTED"
          ? ("danger" as const)
          : h.action === "ACTIVITY_RETURNED"
            ? ("warning" as const)
            : ("neutral" as const),
  }));

  const editable = active && isOfficer && ["DRAFT", "RETURNED"].includes(proposal.status);

  return (
    <>
      <PageHeader
        title={proposal.title}
        description={`${proposal.organization.name} · AY ${proposal.academicYear}`}
        breadcrumb={[{ label: "Activity Proposals", href: "/activities" }, { label: "Details" }]}
        actions={
          <>
            {editable && (
              <Link
                href={`/activities/${proposal.id}/edit`}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content hover:border-primary hover:text-primary"
              >
                <Pencil className="size-4" aria-hidden />
                Edit
              </Link>
            )}
            <Link
              href="/activities"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </Link>
          </>
        }
      />

      <Card className="mb-6">
        <CardContent className="py-6">
          {stepIndex >= 0 ? (
            <WorkflowSteps steps={[...ACTIVITY_STEPS]} currentIndex={stepIndex} />
          ) : (
            <Alert tone={proposal.status === "REJECTED" ? "danger" : "warning"} title={`Proposal was ${meta.label.toLowerCase()}`}>
              {proposal.remarks || "See the history below for details."}
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {panels.length > 0 && (
            <Card>
              <CardHeader title="Actions" description="Available based on your role and the current status." />
              <CardContent className="space-y-5">
                {panels.map((p) => (
                  <div key={p.key} className="rounded-xl border border-line p-4">
                    <p className="text-sm font-bold text-content">{p.title}</p>
                    {p.description && (
                      <p className="mt-0.5 mb-3 text-xs text-content-secondary">{p.description}</p>
                    )}
                    <ActionForm
                      action={p.action}
                      submitLabel={p.submitLabel}
                      variant={p.variant}
                      footerClassName="mt-3"
                      className="space-y-3"
                    >
                      <input type="hidden" name="id" value={proposal.id} />
                      {p.needNote && (
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-content-secondary">
                            {p.noteLabel}
                          </span>
                          <textarea
                            name="note"
                            rows={3}
                            maxLength={1000}
                            required
                            placeholder="Provide a clear explanation…"
                            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                          />
                        </label>
                      )}
                    </ActionForm>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader title="Proposal record" />
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-content-secondary">Status</dt>
                  <dd className="font-semibold"><Badge tone={meta.tone}>{meta.label}</Badge></dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-content-secondary">Scope</dt>
                  <dd className="text-content">{ACTIVITY_SCOPE_LABELS[proposal.scope]}</dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-content-secondary">Starts</dt>
                  <dd className="text-content">{formatDateTime(proposal.startAt)}</dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-content-secondary">Ends</dt>
                  <dd className="text-content">{formatDateTime(proposal.endAt)}</dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-content-secondary">Venue</dt>
                  <dd className="text-content">{proposal.venue ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-content-secondary">Estimated budget</dt>
                  <dd className="tabular-nums text-content">
                    {proposal.estimatedBudget != null ? formatMoney(proposal.estimatedBudget) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-content-secondary">Expected participants</dt>
                  <dd className="tabular-nums text-content">{proposal.expectedParticipants ?? "—"}</dd>
                </div>
                {(proposal.decidedAt || proposal.submittedAt) && (
                  <div className="flex justify-between gap-4 sm:block">
                    <dt className="text-content-secondary">Decided</dt>
                    <dd className="text-content">
                      {formatDateTime(proposal.decidedAt)}
                      {proposal.decidedBy && (
                        <span className="block text-xs text-content-secondary">
                          by {fullName(proposal.decidedBy)}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-4 border-t border-line pt-4">
                <h3 className="mb-1.5 text-xs font-bold tracking-wide text-content-secondary uppercase">
                  Description
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-content">
                  {proposal.description}
                </p>
              </div>
              {proposal.objectives && (
                <div className="mt-4 border-t border-line pt-4">
                  <h3 className="mb-1.5 text-xs font-bold tracking-wide text-content-secondary uppercase">
                    Objectives
                  </h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-content">
                    {proposal.objectives}
                  </p>
                </div>
              )}
              {proposal.report && (
                <div className="mt-4 rounded-lg border border-line bg-surface-secondary px-4 py-3 text-sm">
                  Accomplishment report:{" "}
                  <Link href={`/reports/${proposal.report.id}`} className="font-semibold text-primary hover:underline">
                    open report
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <AttachmentsCard
            entityType="ActivityProposal"
            entityId={proposal.id}
            canManage={canManageAttachments(user, {
              id: proposal.id,
              status: proposal.status,
              organizationId: proposal.organizationId,
              organization: proposal.organization,
            })}
          />

          {attendanceAllowedStatus(proposal.status) && (
            <AttendanceCard
              activity={{
                id: proposal.id,
                title: proposal.title,
                status: proposal.status,
                startAt: proposal.startAt,
                endAt: proposal.endAt,
                academicYear: proposal.academicYear,
                organizationId: proposal.organizationId,
              }}
              viewerId={user.id}
              canManage={canManageAttendance(user, {
                id: proposal.id,
                status: proposal.status,
                organizationId: proposal.organizationId,
                organization: proposal.organization,
              })}
            />
          )}
        </div>

        <Card className="self-start">
          <CardHeader title="History" description="Every action is permanently recorded." />
          <CardContent>
            {timelineItems.length > 0 ? (
              <Timeline items={timelineItems} />
            ) : (
              <p className="text-sm text-content-muted">No recorded actions yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
