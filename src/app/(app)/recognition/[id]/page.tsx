import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CalendarClock, CheckCircle2, CircleDashed, FileStack, FileText, Gavel, History, Undo2 } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { RECOGNITION_STATUS_META, INTERVIEW_STATUS_META, REQUIREMENT_STATUS_META } from "@/lib/constants";
import { checklistForYear, compliancePct } from "@/lib/analytics";
import { formatDateTime, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { WorkflowTracker } from "@/components/ui/workflow-tracker";
import { Timeline } from "@/components/ui/timeline";
import { ActionForm } from "@/components/action-form";
import { AttachmentsCard } from "@/components/attachments-card";
import { canManageAttachments } from "@/lib/attachment-access";
import {
  advanceToSignature,
  approveApplication,
  conferRecognition,
  endorseForApproval,
  recordInterviewOutcome,
  rejectApplication,
  returnApplication,
  scheduleInterview,
  startReview,
  submitRecognition,
} from "@/lib/actions/recognition";
import type { ActionState } from "@/lib/actions/recognition";
export const instant = false;

export const metadata: Metadata = { title: "Application details" };

export default async function RecognitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const rec = await db.recognition.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          college: true,
          members: { where: { isCurrent: true }, select: { userId: true, position: true } },
        },
      },
      events: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { firstName: true, lastName: true } } },
      },
      decidedBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!rec) notFound();

  // Scope enforcement: non-admins must be connected to this organization.
  if (!can(user, "org.manage") && user.role !== "DEAN") {
    const isMember = rec.organization.members.some((m) => m.userId === user.id);
    const isAdviser =
      (user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME")
        ? await db.adviserAssignment.findFirst({
            where: { adviserId: user.id, organizationId: rec.organizationId, isCurrent: true },
          })
        : null;
    if (!isMember && !isAdviser) notFound();
  }
  if (
    user.role === "DEAN" &&
    rec.organization.collegeId !== user.collegeId &&
    !can(user, "org.manage")
  ) {
    notFound();
  }

  const isOfficer =
    (user.role === "PRESIDENT" || user.role === "SECRETARY") &&
    rec.organization.members.some((m) => m.userId === user.id);
  const meta = RECOGNITION_STATUS_META[rec.status];

  // ---- SF-001 requirements for this application (President-facing) -------
  const [recAttachments, reports, financialSubmissions] = await Promise.all([
    db.attachment.findMany({
      where: { entityType: "Recognition", entityId: rec.id },
      select: { kind: true },
    }),
    db.accomplishmentReport.findMany({
      where: { organizationId: rec.organizationId, academicYear: rec.academicYear },
      select: { academicYear: true, status: true },
    }),
    db.financialSubmission.findMany({
      where: { organizationId: rec.organizationId, academicYear: rec.academicYear },
      select: { academicYear: true, status: true },
    }),
  ]);
  const requirementItems = checklistForYear(
    [{ academicYear: rec.academicYear, status: rec.status }],
    recAttachments
      .filter((a): a is { kind: NonNullable<typeof a.kind> } => a.kind !== null)
      .map((a) => ({ academicYear: rec.academicYear, kind: a.kind })),
    reports,
    rec.academicYear,
    financialSubmissions
  );
  const compliance = compliancePct(requirementItems);
  const requirementsMet = requirementItems.every((i) => i.met);

  // ---- Available actions ---------------------------------------------------
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
  const panels: Panel[] = [];
  const active = !user.isViewOnly;

  if (active && isOfficer && ["DRAFT", "RETURNED"].includes(rec.status)) {
    panels.push({
      key: "submit",
      title: rec.status === "RETURNED" ? "Resubmit application" : "Submit application",
      description:
        rec.status === "RETURNED" && rec.remarks
          ? `Returned with feedback — address it before resubmitting.`
          : "Submit this application to OSAS for review.",
      variant: "primary",
      submitLabel: rec.status === "RETURNED" ? "Resubmit" : "Submit for review",
      action: submitRecognition,
    });
  }
  if (active && can(user, "recognition.review")) {
    const deanScoped = user.role === "DEAN";
    if (deanScoped && rec.organization.collegeId !== user.collegeId) {
      // out of scope - no panels
    } else if (rec.status === "SUBMITTED") {
      panels.push(
        {
          key: "review",
          title: "Start review",
          description: "Mark this application as under review.",
          variant: "primary",
          submitLabel: "Start review",
          action: startReview,
        },
        {
          key: "return",
          title: "Return to organization",
          description: "Send back to the officers with feedback.",
          needNote: true,
          noteLabel: "What needs to be corrected or added?",
          variant: "outline",
          submitLabel: "Return with note",
          action: returnApplication,
        }
      );
    } else if (rec.status === "UNDER_REVIEW") {
      panels.push(
        {
          key: "endorse",
          title: "Endorse for approval",
          description: "Review complete — forward to the approving authority.",
          variant: "primary",
          submitLabel: "Endorse",
          action: endorseForApproval,
        },
        {
          key: "return",
          title: "Return to organization",
          needNote: true,
          noteLabel: "What needs to be corrected or added?",
          variant: "outline",
          submitLabel: "Return with note",
          action: returnApplication,
        }
      );
    }
  }
  if (active && can(user, "recognition.approve")) {
    const deanScoped = user.role === "DEAN";
    if (!(deanScoped && rec.organization.collegeId !== user.collegeId) && rec.status === "FOR_APPROVAL") {
      panels.push(
        {
          key: "advance-signature",
          title: "Forward for signature",
          description: "Move to the signature stage before final approval.",
          variant: "primary",
          submitLabel: "Forward for signature",
          action: advanceToSignature,
        },
        {
          key: "reject",
          title: "Reject application",
          description: "Rejects permanently — history is retained.",
          needNote: true,
          noteLabel: "Reason for rejection",
          variant: "danger",
          submitLabel: "Reject",
          action: rejectApplication,
        },
        {
          key: "return",
          title: "Return to organization",
          needNote: true,
          noteLabel: "What needs to be corrected or added?",
          variant: "outline",
          submitLabel: "Return with note",
          action: returnApplication,
        }
      );
    }
    if (!(deanScoped && rec.organization.collegeId !== user.collegeId) && rec.status === "FOR_SIGNATURE") {
      panels.push(
        {
          key: "approve",
          title: "Approve application",
          description: "Approve the organization for recognition in AY " + rec.academicYear + ".",
          variant: "primary",
          submitLabel: "Approve",
          action: approveApplication,
        },
        {
          key: "reject",
          title: "Reject application",
          description: "Rejects permanently — history is retained.",
          needNote: true,
          noteLabel: "Reason for rejection",
          variant: "danger",
          submitLabel: "Reject",
          action: rejectApplication,
        }
      );
    }
  }
  if (active && user.role === "OSAS" && rec.status === "APPROVED") {
    panels.push({
      key: "confer",
      title: "Confer recognition",
      description: `Officially recognize ${rec.organization.name} for AY ${rec.academicYear}.`,
      variant: "gold",
      submitLabel: "Confer recognition",
      action: conferRecognition,
    });
  }

  const timelineItems = rec.events.map((e) => ({
    id: e.id,
    title:
      e.toStatus
        ? `${e.fromStatus?.replaceAll("_", " ").toLowerCase() ?? "start"} → ${e.toStatus.replaceAll("_", " ").toLowerCase()}`
        : e.action
            .replaceAll("_", " ")
            .toLowerCase()
            .replace(/^interview /, "Interview: "),
    meta: formatDateTime(e.createdAt),
    actor: e.actor ? fullName(e.actor) : null,
    body: e.note,
    tone:
      e.action?.startsWith("INTERVIEW_PASSED") || e.toStatus === "RECOGNIZED" || e.toStatus === "APPROVED"
        ? ("success" as const)
        : e.toStatus === "REJECTED"
          ? ("danger" as const)
          : e.toStatus === "RETURNED" || e.action === "INTERVIEW_NEEDS_REVISION"
            ? ("warning" as const)
            : e.toStatus || e.action?.startsWith("INTERVIEW_")
              ? ("info" as const)
              : ("neutral" as const),
  }));

  // §16-§18: the distinct interview stage lives inside pending/under review.
  const interviewRelevant = ["SUBMITTED", "UNDER_REVIEW"].includes(rec.status);
  const canReviewHere =
    active &&
    can(user, "recognition.review") &&
    !(user.role === "DEAN" && rec.organization.collegeId !== user.collegeId);
  const showInterviewControls = interviewRelevant && canReviewHere;

  return (
    <>
      <PageHeader
        title={`AY ${rec.academicYear} · ${rec.kind === "RENEWAL" ? "Renewal" : "Initial Recognition"}`}
        description={`${rec.organization.name} · ${rec.organization.college.name}`}
        breadcrumb={[
          { label: "Recognition & Renewal", href: "/recognition" },
          { label: rec.organization.acronym ?? rec.organization.name },
        ]}
        actions={
          <>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <Link
              href={`/organizations/${rec.organization.id}`}
              className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-content hover:border-primary"
            >
              Organization profile
            </Link>
          </>
        }
      />

      {/* Workflow — official application process tracker (client-defined) */}
      <Card className="mb-6">
        <CardContent className="space-y-5 py-6">
          <WorkflowTracker
            process={rec.kind === "RENEWAL" ? "RENEWAL" : "RECOGNITION"}
            status={rec.status}
          />
          {(rec.status === "RETURNED" || rec.status === "REJECTED") && (
            <Alert
              tone={rec.status === "REJECTED" ? "danger" : "warning"}
              title={`Application was ${meta.label.toLowerCase()}`}
            >
              {rec.remarks || "See the timeline below for details."}
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Actions + details */}
        <div className="space-y-6 lg:col-span-2">
          {panels.length > 0 && (
            <Card>
              <CardHeader icon={Gavel} title="Actions" description="Available based on your role and the current status." />
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
                      <input type="hidden" name="id" value={rec.id} />
                      {p.needNote && (
                        <Field label={p.noteLabel ?? "Note"} htmlFor={`note-${p.key}`} required>
                          <Textarea
                            id={`note-${p.key}`}
                            name="note"
                            rows={3}
                            maxLength={1000}
                            required
                            placeholder="Provide a clear explanation…"
                          />
                        </Field>
                      )}
                    </ActionForm>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* SF-001 requirements — the COMPLETE REQUIREMENT? gate */}
          <Card>
            <CardHeader
              icon={FileStack}
              title={`SF-001 requirements · AY ${rec.academicYear}`}
              description={`${requirementItems.filter((i) => i.met).length}/${requirementItems.length} complete · ${compliance}% of required documents filed.`}
            />
            <CardContent className="space-y-3">
              <ul className="divide-y divide-line">
                {requirementItems.map((item) => (
                  <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {item.met ? (
                        <CheckCircle2 className="size-4.5 shrink-0 text-green-600" aria-hidden />
                      ) : (
                        <CircleDashed className="size-4.5 shrink-0 text-content-muted" aria-hidden />
                      )}
                      <span className="text-sm font-semibold text-content">{item.label}</span>
                    </div>
                    <Badge tone={REQUIREMENT_STATUS_META[item.status].tone}>
                      {REQUIREMENT_STATUS_META[item.status].label}
                    </Badge>
                  </li>
                ))}
              </ul>

              {rec.status === "RETURNED" && (
                <div className="rounded-lg border border-warning/30 bg-warning-light/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                    Follow-up required
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {requirementItems
                      .filter((i) => !i.met)
                      .map((i) => (
                        <li key={i.key} className="flex items-center gap-1.5 text-sm text-content">
                          <CircleDashed className="size-3.5 shrink-0 text-content-muted" aria-hidden />
                          <span>{i.label}</span>
                          <Badge tone="danger">Missing</Badge>
                        </li>
                      ))}
                    {requirementItems
                      .filter((i) => i.met && i.status === "RETURNED")
                      .map((i) => (
                        <li key={i.key} className="flex items-center gap-1.5 text-sm text-content">
                          <Undo2 className="size-3.5 shrink-0 text-warning" aria-hidden />
                          <span>{i.label}</span>
                          <Badge tone="orange">Correction</Badge>
                        </li>
                      ))}
                    {requirementItems.every((i) => i.met) && (
                      <li className="text-sm text-content-secondary">
                        All required documents are on file — address the reviewer remarks above and
                        resubmit.
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-secondary px-3 py-2 text-xs text-content-secondary">
                <span>
                  {!requirementsMet && ["DRAFT", "RETURNED"].includes(rec.status)
                    ? "Submission is blocked until every required document is complete."
                    : "Documents track their application: Submitted → Under Review → Approved (or Returned)."}
                </span>
                <Link
                  href={`/organizations/${rec.organizationId}/documents`}
                  className="shrink-0 font-semibold text-primary hover:underline"
                >
                  Manage documents
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* §16-§18: Interview stage */}
          {(showInterviewControls || rec.interviewStatus !== "NOT_SCHEDULED") && (
            <Card>
              <CardHeader
                icon={CalendarClock}
                title="Interview"
                description="A distinct stage of the review — scheduling and outcome are tracked here."
              />
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={INTERVIEW_STATUS_META[rec.interviewStatus].tone}>
                    {INTERVIEW_STATUS_META[rec.interviewStatus].label}
                  </Badge>
                  {rec.interviewAt && (
                    <span className="text-sm font-medium text-content">
                      {formatDateTime(rec.interviewAt)}
                    </span>
                  )}
                </div>
                {rec.interviewNotes && (
                  <p className="rounded-lg bg-surface-secondary px-3 py-2 text-sm whitespace-pre-wrap text-content-secondary">
                    {rec.interviewNotes}
                  </p>
                )}

                {showInterviewControls && rec.interviewStatus === "NOT_SCHEDULED" && (
                  <ActionForm
                    action={scheduleInterview}
                    submitLabel="Schedule interview"
                    variant="outline"
                    footerClassName="mt-3"
                    className="space-y-3"
                  >
                    <input type="hidden" name="id" value={rec.id} />
                    <Field label="Date & time" htmlFor="interview-at" required>
                      <input
                        id="interview-at"
                        name="interviewAt"
                        type="datetime-local"
                        required
                        className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                      />
                    </Field>
                    <Field label="Instructions / venue (optional)" htmlFor="interview-note">
                      <Textarea id="interview-note" name="note" rows={2} maxLength={500} placeholder="e.g. OSAS conference room, bring the SF-005 roster…" />
                    </Field>
                  </ActionForm>
                )}

                {showInterviewControls && rec.interviewStatus !== "NOT_SCHEDULED" && (
                  <ActionForm
                    action={recordInterviewOutcome}
                    submitLabel="Record outcome"
                    variant="outline"
                    footerClassName="mt-3"
                    className="space-y-3"
                  >
                    <input type="hidden" name="id" value={rec.id} />
                    <Field label="Outcome" htmlFor="interview-outcome" required>
                      <select
                        id="interview-outcome"
                        name="outcome"
                        required
                        defaultValue=""
                        className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                      >
                        <option value="" disabled>
                          Select the result of the interview…
                        </option>
                        <option value="COMPLETED">Completed — proceed with review</option>
                        <option value="PASSED">Passed</option>
                        <option value="FOR_ADDITIONAL_REVIEW">For additional review</option>
                        <option value="NEEDS_REVISION">Needs revision</option>
                      </select>
                    </Field>
                    <Field label="Findings (required when needs revision)" htmlFor="interview-findings">
                      <Textarea id="interview-findings" name="note" rows={2} maxLength={1000} placeholder="What was discussed or must be corrected…" />
                    </Field>
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader icon={FileText} title="Application record" />
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                {[
                  ["Organization", rec.organization.acronym ? `${rec.organization.acronym} (${rec.organization.name})` : rec.organization.name],
                  ["College", rec.organization.college.name],
                  ["Type", rec.kind === "RENEWAL" ? "Renewal of recognition" : "Initial recognition"],
                  ["Academic year", rec.academicYear],
                  ["Submitted", formatDateTime(rec.submittedAt)],
                  ["Review started", formatDateTime(rec.reviewedAt)],
                  ["Decided", formatDateTime(rec.decidedAt)],
                  ["Decided by", rec.decidedBy ? fullName(rec.decidedBy) : "—"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-content-muted">{k}</dt>
                    <dd className="mt-0.5 text-sm font-medium text-content">{v}</dd>
                  </div>
                ))}
                {rec.remarks && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-content-muted">Latest remarks</dt>
                    <dd className="mt-1 rounded-lg bg-surface-secondary px-3 py-2 text-sm whitespace-pre-wrap text-content-secondary">
                      {rec.remarks}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <AttachmentsCard
            entityType="Recognition"
            entityId={rec.id}
            canManage={canManageAttachments(user, {
              id: rec.id,
              status: rec.status,
              organizationId: rec.organizationId,
              organization: rec.organization,
            })}
          />
        </div>

        {/* Timeline */}
        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader icon={History} title="History" description="Every action is permanently recorded." />
          <Timeline items={timelineItems} />
        </Card>
      </div>

      {rec.status === "SUBMITTED" && !isOfficer && !can(user, "recognition.review") && (
        <div className="mt-6">
          <Alert tone="info" title="Awaiting review">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-4" aria-hidden />
              This application has been submitted and is waiting for OSAS/SOA review.
            </span>
          </Alert>
        </div>
      )}
      {!panels.length && rec.status === "DRAFT" && (
        <div className="mt-6">
          <Alert tone="warning" title="Draft — not yet submitted">
            <span className="inline-flex items-center gap-1.5">
              <Award className="size-4" aria-hidden />
              Organization officers must open this draft and submit it to begin the review process.
            </span>
          </Alert>
        </div>
      )}
      {rec.status === "RETURNED" && (
        <div className="mt-6">
          <Alert tone="warning" title="Returned for revision">
            <span className="inline-flex items-center gap-1.5">
              <Undo2 className="size-4" aria-hidden />
              This application was returned to the organization officers for revision.
            </span>
          </Alert>
        </div>
      )}
    </>
  );
}
