import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { AUDIT_ACTION_LABELS, REPORT_STATUS_META } from "@/lib/constants";
import { REPORT_STEPS, reportStepIndex } from "@/lib/org-state";
import { formatDate, formatDateTime, formatMoney, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { WorkflowSteps } from "@/components/ui/progress";
import { ActionForm } from "@/components/action-form";
import { AttachmentsCard } from "@/components/attachments-card";
import { canManageAttachments } from "@/lib/attachment-access";
import { acceptReport, returnReport, submitReport } from "@/lib/actions/reports";
import type { ActionState } from "@/lib/actions/reports";
export const instant = false;

export const metadata: Metadata = { title: "Accomplishment report" };

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

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const report = await db.accomplishmentReport.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          college: true,
          members: { where: { isCurrent: true }, select: { userId: true, position: true } },
        },
      },
      activityProposal: {
        select: {
          id: true,
          title: true,
          status: true,
          startAt: true,
          endAt: true,
          venue: true,
          expectedParticipants: true,
          estimatedBudget: true,
        },
      },
      decidedBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!report) notFound();

  // Scope enforcement mirrors recognition.
  if (!can(user, "org.manage") && user.role !== "DEAN") {
    const isMember = report.organization.members.some((m) => m.userId === user.id);
    const isAdviser =
      (user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME")
        ? await db.adviserAssignment.findFirst({
            where: { adviserId: user.id, organizationId: report.organizationId, isCurrent: true },
          })
        : null;
    if (!isMember && !isAdviser) notFound();
  }
  if (
    user.role === "DEAN" &&
    !can(user, "org.manage") &&
    report.organization.collegeId !== user.collegeId
  ) {
    notFound();
  }

  const isOfficer =
    (user.role === "PRESIDENT" || user.role === "SECRETARY") &&
    report.organization.members.some((m) => m.userId === user.id);
  const meta = REPORT_STATUS_META[report.status];
  const stepIndex = reportStepIndex(report.status);
  const active = !user.isViewOnly;

  const panels: Panel[] = [];
  if (active && isOfficer && ["DRAFT", "RETURNED"].includes(report.status)) {
    panels.push({
      key: "submit",
      title: report.status === "RETURNED" ? "Resubmit report" : "Submit report",
      description:
        report.status === "RETURNED" && report.remarks
          ? "Returned with feedback — address it before resubmitting."
          : "Submit to OSAS or the college for review.",
      variant: "primary",
      submitLabel: report.status === "RETURNED" ? "Resubmit" : "Submit",
      action: submitReport,
    });
  }
  if (active && can(user, "activity.approve") && report.status === "SUBMITTED") {
    const deanScoped = user.role === "DEAN";
    if (!deanScoped || report.organization.collegeId === user.collegeId) {
      panels.push(
        {
          key: "accept",
          title: "Accept report",
          description: report.activityProposal
            ? "Accepting this report marks the linked activity as completed."
            : "Accept this accomplishment report.",
          variant: "primary",
          submitLabel: "Accept",
          action: acceptReport,
        },
        {
          key: "return",
          title: "Return to organization",
          needNote: true,
          noteLabel: "What needs to be corrected or added?",
          variant: "outline",
          submitLabel: "Return with note",
          action: returnReport,
        }
      );
    }
  }

  const history = await db.auditLog.findMany({
    where: { entityType: "AccomplishmentReport", entityId: report.id },
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
      h.action === "REPORT_ACCEPTED"
        ? ("success" as const)
        : h.action === "REPORT_RETURNED"
          ? ("warning" as const)
          : ("neutral" as const),
  }));

  const editable = active && isOfficer && ["DRAFT", "RETURNED"].includes(report.status);

  // Evidence gate: planned-activity reports need at least one attachment on submit.
  const evidenceCount = await db.attachment.count({
    where: { entityType: "AccomplishmentReport", entityId: report.id },
  });
  const evidencePending =
    Boolean(report.activityProposal) && ["DRAFT", "RETURNED"].includes(report.status) && evidenceCount === 0;
  const proposal = report.activityProposal;
  const scheduled =
    proposal && proposal.startAt
      ? proposal.endAt &&
        proposal.endAt.getTime() !== proposal.startAt.getTime()
        ? `${formatDate(proposal.startAt)} → ${formatDate(proposal.endAt)}`
        : formatDate(proposal.startAt)
      : null;
  const attendanceGap =
    proposal &&
    report.actualParticipants != null &&
    proposal.expectedParticipants != null &&
    report.actualParticipants < proposal.expectedParticipants;
  const utilization =
    proposal &&
    proposal.estimatedBudget != null &&
    proposal.estimatedBudget > 0 &&
    report.actualBudget != null
      ? Math.round((report.actualBudget / proposal.estimatedBudget) * 100)
      : null;

  return (
    <>
      <PageHeader
        title={report.title}
        description={`${report.organization.name} · AY ${report.academicYear}`}
        breadcrumb={[{ label: "Accomplishment Reports", href: "/reports" }, { label: "Details" }]}
        actions={
          <>
            {editable && (
              <Link
                href={`/reports/${report.id}/edit`}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content hover:border-primary hover:text-primary"
              >
                <Pencil className="size-4" aria-hidden />
                Edit
              </Link>
            )}
            <Link
              href="/reports"
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
            <WorkflowSteps steps={[...REPORT_STEPS]} currentIndex={stepIndex} />
          ) : (
            <Alert tone="warning" title="Report was returned">
              {report.remarks || "See the history below for details."}
            </Alert>
          )}
          {evidencePending && (
            <Alert tone="warning" title="Supporting evidence required" className="mt-4">
              A report for a planned activity needs at least one attached document before it can be
              submitted. Upload attendance or proof-of-conduct under Supporting documents below.
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
                      <input type="hidden" name="id" value={report.id} />
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
            <CardHeader title="Report record" />
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-content-secondary">Status</dt>
                  <dd className="font-semibold"><Badge tone={meta.tone}>{meta.label}</Badge></dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-content-secondary">Date held</dt>
                  <dd className="text-content">{formatDate(report.heldOn)}</dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-content-secondary">Actual participants</dt>
                  <dd className="tabular-nums text-content">{report.actualParticipants ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-content-secondary">Actual expenses</dt>
                  <dd className="tabular-nums text-content">
                    {report.actualBudget != null ? formatMoney(report.actualBudget) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-content-secondary">Linked proposal</dt>
                  <dd className="text-content">
                    {report.activityProposal ? (
                      <Link href={`/activities/${report.activityProposal.id}`} className="font-medium text-primary hover:underline">
                        {report.activityProposal.title}
                      </Link>
                    ) : (
                      "Unplanned activity"
                    )}
                  </dd>
                </div>
                {report.reviewedAt && (
                  <div className="flex justify-between gap-4 sm:block">
                    <dt className="text-content-secondary">Reviewed</dt>
                    <dd className="text-content">
                      {formatDateTime(report.reviewedAt)}
                      {report.decidedBy && (
                        <span className="block text-xs text-content-secondary">
                          by {fullName(report.decidedBy)}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-4 border-t border-line pt-4">
                <h3 className="mb-1.5 text-xs font-bold tracking-wide text-content-secondary uppercase">
                  Narrative
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-content">
                  {report.narrative}
                </p>
              </div>
            </CardContent>
          </Card>

          {proposal && (
            <Card>
              <CardHeader
                title="Against the approved plan"
                description="Planned in the linked activity proposal vs what actually happened."
              />
              <CardContent>
                {attendanceGap && (
                  <Alert tone="warning" title="Attendance below plan" className="mb-4">
                    Actual participants ({report.actualParticipants}) fell below the planned{" "}
                    {proposal.expectedParticipants}. Confirm the reason in the narrative.
                  </Alert>
                )}
                <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-4 sm:block">
                    <dt className="text-content-secondary">Scheduled</dt>
                    <dd className="font-medium text-content">{scheduled ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4 sm:block">
                    <dt className="text-content-secondary">Venue</dt>
                    <dd className="text-content">{proposal.venue ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4 sm:block">
                    <dt className="text-content-secondary">Participants</dt>
                    <dd className="tabular-nums text-content">
                      {proposal.expectedParticipants != null ? (
                        <>
                          {proposal.expectedParticipants} planned
                          {report.actualParticipants != null && (
                            <span className="ml-1 text-xs text-content-secondary">
                              · {report.actualParticipants} actual
                            </span>
                          )}
                        </>
                      ) : (
                        report.actualParticipants ?? "—"
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 sm:block">
                    <dt className="text-content-secondary">Approved budget</dt>
                    <dd className="tabular-nums text-content">
                      {proposal.estimatedBudget != null ? formatMoney(proposal.estimatedBudget) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 sm:block">
                    <dt className="text-content-secondary">Actual expenses</dt>
                    <dd className="tabular-nums text-content">
                      {report.actualBudget != null ? formatMoney(report.actualBudget) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 sm:block">
                    <dt className="text-content-secondary">Budget utilized</dt>
                    <dd className="tabular-nums text-content">
                      {utilization != null ? (
                        <span className={utilization > 100 ? "font-semibold text-red-600" : ""}>
                          {utilization}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}

          <AttachmentsCard
            entityType="AccomplishmentReport"
            entityId={report.id}
            canManage={canManageAttachments(user, {
              id: report.id,
              status: report.status,
              organizationId: report.organizationId,
              organization: report.organization,
            })}
          />
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
