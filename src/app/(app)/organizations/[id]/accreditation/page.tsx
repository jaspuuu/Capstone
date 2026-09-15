import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  FileText,
  CheckCircle2,
  CircleDashed,
  AlertCircle,
  ArrowRight,
  Clock,
  RefreshCw,
  FileStack,
  Landmark,
  GraduationCap,
  CalendarDays,
  User,
  Users,
  ShieldQuestion,
  History,
  Gavel,
  CalendarClock,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, orgScopeWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import {
  RECOGNITION_STATUS_META,
  INTERVIEW_STATUS_META,
  ORG_APPLICATION_STATUS_META,
} from "@/lib/constants";
import { checklistForYear, compliancePct, type RequirementItem } from "@/lib/analytics";
import { currentAcademicYear, formatDateTime, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { WorkflowTracker } from "@/components/ui/workflow-tracker";
import { Field, Textarea } from "@/components/ui/form";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
import { ActionForm } from "@/components/action-form";
import { AttachmentsCard } from "@/components/attachments-card";
import { canManageAttachments } from "@/lib/attachment-access";
import { getRouteWithSteps } from "@/lib/signature-routing";
import { requirementFormRoute, sfRouteEntityId, SIGNATORY_LABELS } from "@/lib/form-routes";
import { RequirementCard } from "@/components/accreditation/requirement-card";
import { DocumentLocationTracker } from "@/components/accreditation/document-location-tracker";
import { SubmissionValidationGate } from "@/components/accreditation/submission-validation-gate";
import { FollowUpCard } from "@/components/accreditation/follow-up-card";
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
} from "@/lib/actions/recognition";
import type { ActionState } from "@/lib/actions/recognition";
import { OrgWorkspaceNav } from "@/components/org-workspace-nav";

export const instant = false;

export const metadata: Metadata = { title: "Accreditation" };

function getRecognitionForYear(orgId: string, ay: string) {
  return db.recognition.findFirst({
    where: { organizationId: orgId, academicYear: ay },
    include: {
      organization: {
        include: {
          college: true,
          members: {
            where: { isCurrent: true },
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
            orderBy: { position: "asc" },
          },
          advisers: {
            where: { isCurrent: true },
            include: { adviser: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
          },
        },
      },
      events: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { firstName: true, lastName: true } } },
      },
      decidedBy: { select: { firstName: true, lastName: true } },
      followUp: {
        include: { completedBy: { select: { firstName: true, lastName: true } } },
      },
    },
  });
}

type GateSignatureRoute = {
  formKey: string;
  state: string;
  steps: {
    order: number;
    role: string;
    status: "LOCKED" | "CURRENT" | "SIGNED" | "RETURNED" | "REJECTED";
    signedAt: string | null;
    signer: { firstName: string; lastName: string } | null;
  }[];
};

async function withSignatureRoutes(
  rec: Awaited<ReturnType<typeof getRecognitionForYear>>
): Promise<Awaited<ReturnType<typeof getRecognitionForYear>> & { signatureRoutes: any }> {
  if (!rec) return rec as never;
  const route = await getRouteWithSteps("SF", sfRouteEntityId("SF001", rec.organizationId, rec.academicYear));
  const signatureRoutes: GateSignatureRoute[] = route
    ? [
        {
          formKey: "SF001",
          state: route.state,
          steps: route.steps.map((s) => ({
            order: s.order,
            role: s.role,
            status: s.status,
            signedAt: s.signedAt ? s.signedAt.toISOString() : null,
            signer: s.signer ? { firstName: s.signer.firstName, lastName: s.signer.lastName } : null,
          })),
        },
      ]
    : [];
  return { ...rec, signatureRoutes: signatureRoutes as any };
}

async function getRequirements(rec: any, ay: string): Promise<RequirementItem[]> {
  const [attachments, reports, financialSubmissions] = await Promise.all([
    db.attachment.findMany({
      where: { entityType: "Recognition", entityId: rec.id },
      select: { kind: true },
    }),
    db.accomplishmentReport.findMany({
      where: { organizationId: rec.organizationId, academicYear: ay },
      select: { academicYear: true, status: true },
    }),
    db.financialSubmission.findMany({
      where: { organizationId: rec.organizationId, academicYear: ay },
      select: { academicYear: true, status: true },
    }),
  ]);

  return checklistForYear(
    [{ academicYear: rec.academicYear, status: rec.status, kind: rec.kind }],
    attachments
      .filter((a) => a.kind !== null)
      .map((a) => ({ academicYear: ay, kind: a.kind! })),
    reports,
    ay,
    financialSubmissions,
    rec.kind,
  );
}

/** Latest signed/action timestamp across the application events, for a
 * friendly "last updated" line on each requirement card. */
function lastUpdatedSource(events: any[]): string | null {
  return events && events.length > 0 ? formatDateTime(events[0].createdAt) : null;
}

function sf001SigningState(activeRec: any): {
  completed: number;
  total: number;
  state: string;
  currentRole: string | null;
  currentLabel: string | null;
} {
  const route = activeRec?.signatureRoutes?.[0];
  if (!route) return { completed: 0, total: 0, state: "NONE", currentRole: null, currentLabel: null };
  const steps = route.steps ?? [];
  const completed = steps.filter((s: any) => s.status === "SIGNED").length;
  const current = steps.find((s: any) => s.status === "CURRENT");
  return {
    completed,
    total: steps.length,
    state: route.state,
    currentRole: current?.role ?? null,
    currentLabel: current?.role ? (SIGNATORY_LABELS[current.role as keyof typeof SIGNATORY_LABELS] ?? current.role) : null,
  };
}

export default async function AccreditationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  // Internal process page — plain members only see application status, never
  // the requirements workflow, forms, or review trail.
  if (user.role === "MEMBER") notFound();
  const { id } = await params;
  const ay = currentAcademicYear();

  const org = await db.organization.findFirst({
    where: { AND: [orgScopeWhere(user), { id }] },
    select: {
      id: true,
      name: true,
      acronym: true,
      description: true,
      type: true,
      collegeId: true,
      applicationStatus: true,
      recognitions: {
        select: {
          id: true,
          academicYear: true,
          kind: true,
          status: true,
          submittedAt: true,
          decidedAt: true,
        },
        orderBy: { academicYear: "desc" },
      },
    },
  });
  if (!org) notFound();

  const currentRecognition = org.recognitions.find((r) => r.academicYear === ay);
  const prevRecognition = org.recognitions.find((r) => r.academicYear !== ay && ["APPROVED", "RECOGNIZED"].includes(r.status));
  const canCreate = can(user, "recognition.submit") && !currentRecognition;

  let activeRec = null;
  let requirements: RequirementItem[] = [];
  let compliance = 0;
  let missingRequired: RequirementItem[] = [];
  let nextAction: { label: string; href: string; by?: string } | null = null;
  let readiness: "NOT_READY" | "READY" | "SUBMITTED" | "DECIDED" | null = null;
  let sigState: {
    completed: number;
    total: number;
    state: string;
    currentRole: string | null;
    currentLabel: string | null;
  } = { completed: 0, total: 0, state: "NONE", currentRole: null, currentLabel: null };

  if (currentRecognition) {
    activeRec = await withSignatureRoutes(await getRecognitionForYear(id, ay));
    if (activeRec) {
      requirements = await getRequirements(activeRec, ay);
      compliance = compliancePct(requirements);
      missingRequired = requirements.filter((r) => !r.filed && r.required !== false);
      sigState = sf001SigningState(activeRec);

      if (["DRAFT", "RETURNED"].includes(activeRec.status)) {
        if (missingRequired.length > 0) {
          readiness = "NOT_READY";
          nextAction = {
            label: `Complete: ${missingRequired[0].label}`,
            href: requirementFormRoute(missingRequired[0].key, id, ay, activeRec.kind),
          };
        } else {
          readiness = "READY";
          nextAction = { label: "Submit application", href: "#submit-action" };
        }
      } else if (["SUBMITTED", "UNDER_REVIEW", "FOR_SIGNATURE", "FOR_APPROVAL"].includes(activeRec.status)) {
        readiness = "SUBMITTED";
      } else if (["APPROVED", "RECOGNIZED", "REJECTED"].includes(activeRec.status)) {
        readiness = "DECIDED";
      }
    }
  }

  const president = activeRec?.organization?.members?.find((m: any) => m.position === "PRESIDENT")?.user;
  const seniorAdviser = activeRec?.organization?.advisers?.find((a: any) => a.type === "REGULAR")?.adviser;
  const juniorAdviser = activeRec?.organization?.advisers?.find((a: any) => a.type === "PART_TIME")?.adviser;

  // ---- Officer: member of THIS org holding a signing office -----------------
  const isMember = activeRec?.organization?.members?.some(
    (m: any) => m.userId === user.id
  );
  const isOfficerRole = user.role === "PRESIDENT" || user.role === "SECRETARY";
  const isOfficer = Boolean(isOfficerRole && isMember);

  // ---- Available workflow actions (role + status gated) ---------------------
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
  const rec = activeRec;

  if (rec && active && can(user, "recognition.review")) {
    const deanScoped = user.role === "DEAN" && rec.organization.collegeId !== user.collegeId;
    if (!deanScoped && rec.status === "SUBMITTED") {
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
    } else if (!deanScoped && rec.status === "UNDER_REVIEW") {
      panels.push(
        {
          key: "endorse",
          title: "Endorse for approval",
          description: "Review complete \u2014 forward to the approving authority.",
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
  if (rec && active && can(user, "recognition.approve")) {
    const deanScoped = user.role === "DEAN" && rec.organization.collegeId !== user.collegeId;
    if (!deanScoped && rec.status === "FOR_APPROVAL") {
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
          description: "Rejects permanently \u2014 history is retained.",
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
    if (!deanScoped && rec.status === "FOR_SIGNATURE") {
      panels.push(
        {
          key: "approve",
          title: "Approve application",
          description: `Approve the organization for recognition in AY ${rec.academicYear}.`,
          variant: "primary",
          submitLabel: "Approve",
          action: approveApplication,
        },
        {
          key: "reject",
          title: "Reject application",
          description: "Rejects permanently \u2014 history is retained.",
          needNote: true,
          noteLabel: "Reason for rejection",
          variant: "danger",
          submitLabel: "Reject",
          action: rejectApplication,
        }
      );
    }
  }
  if (rec && active && user.role === "OSAS" && rec.status === "APPROVED") {
    panels.push({
      key: "confer",
      title: "Confer recognition",
      description: `Officially recognize ${rec.organization.name} for AY ${rec.academicYear}.`,
      variant: "gold",
      submitLabel: "Confer recognition",
      action: conferRecognition,
    });
  }

  // ---- Interview stage controls (§16-§18) -----------------------------------
  const interviewRelevant = rec && ["SUBMITTED", "UNDER_REVIEW"].includes(rec.status);
  const canReviewHere =
    active &&
    !!rec &&
    can(user, "recognition.review") &&
    !(user.role === "DEAN" && rec.organization.collegeId !== user.collegeId);
  const showInterviewControls = Boolean(interviewRelevant && canReviewHere);

  // ---- Activity timeline ----------------------------------------------------
  const timelineItems: TimelineItem[] = (rec?.events ?? []).map((e: any) => ({
    id: e.id,
    title:
      e.toStatus
        ? `${e.fromStatus?.replaceAll("_", " ").toLowerCase() ?? "start"} \u2192 ${e.toStatus.replaceAll("_", " ").toLowerCase()}`
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

  const attachmentParent = rec
    ? {
        id: rec.id,
        status: rec.status,
        organizationId: rec.organizationId,
        organization: {
          collegeId: rec.organization.collegeId,
          members: (rec.organization.members ?? []).map((m: any) => ({
            userId: m.userId,
            position: m.position,
          })),
        },
      }
    : null;

  return (
    <>
      <PageHeader
        title="Organization Accreditation"
        description={`${org.name} · ${org.acronym ?? "—"}`}
        breadcrumb={[
          { label: "Organizations", href: "/organizations" },
          { label: org.acronym ?? org.name, href: `/organizations/${id}` },
          { label: "Accreditation" },
        ]}
        actions={
          <>
            {canCreate && (
              <Link
                href={`/recognition/new?organizationId=${id}&kind=INITIAL`}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
              >
                <Award className="size-4" aria-hidden />
                New Application
              </Link>
            )}
            {prevRecognition && !currentRecognition && can(user, "recognition.submit") && (
              <Link
                href={`/recognition/new?organizationId=${id}&kind=RENEWAL`}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-primary-dark shadow-sm hover:bg-gold-dark hover:text-white"
              >
                <RefreshCw className="size-4" aria-hidden />
                Start Renewal
              </Link>
            )}
          </>
        }
      />

      <OrgWorkspaceNav orgId={id} active="recognition" />

      {/* Organization + Status Header */}
      <Card className="mb-6">
        <CardContent className="py-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Org information block */}
            <div className="lg:col-span-2">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                  {currentRecognition ? "Active Process" : prevRecognition ? "Renewal Available" : "No Active Process"}
                </p>
                {currentRecognition && (
                  <>
                    <Badge tone={currentRecognition.kind === "RENEWAL" ? "gold" : "primary"}>
                      {currentRecognition.kind === "RENEWAL" ? "Renewal" : "Initial Recognition"}
                    </Badge>
                    <Badge tone={RECOGNITION_STATUS_META[currentRecognition.status].tone}>
                      {RECOGNITION_STATUS_META[currentRecognition.status].label}
                    </Badge>
                  </>
                )}
              </div>
              <h2 className="font-display text-2xl font-bold text-content">
                {org.acronym ?? org.name}
                <span className="ml-2 text-base font-semibold text-content-secondary">{org.name}</span>
              </h2>

              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <GraduationCap className="size-4 text-content-muted" aria-hidden />
                  <dt className="text-content-muted w-24 shrink-0">College</dt>
                  <dd className="font-medium text-content">{activeRec?.organization?.college?.name ?? "—"}</dd>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Landmark className="size-4 text-content-muted" aria-hidden />
                  <dt className="text-content-muted w-24 shrink-0">Type</dt>
                  <dd className="font-medium text-content">
                    {currentRecognition ? (currentRecognition.kind === "RENEWAL" ? "Renewal" : "Initial Recognition") : "—"}
                  </dd>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className="size-4 text-content-muted" aria-hidden />
                  <dt className="text-content-muted w-24 shrink-0">Academic Year</dt>
                  <dd className="font-medium text-content">{ay}</dd>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <ShieldQuestion className="size-4 text-content-muted" aria-hidden />
                  <dt className="text-content-muted w-24 shrink-0">Application Status</dt>
                  <dd className="font-medium text-content">
                    {activeRec ? (ORG_APPLICATION_STATUS_META[activeRec.status]?.label ?? activeRec.status) : "—"}
                  </dd>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="size-4 text-content-muted" aria-hidden />
                  <dt className="text-content-muted w-24 shrink-0">President</dt>
                  <dd className="font-medium text-content">{president ? fullName(president) : "—"}</dd>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="size-4 text-content-muted" aria-hidden />
                  <dt className="text-content-muted w-24 shrink-0">Senior Adviser</dt>
                  <dd className="font-medium text-content">{seniorAdviser ? fullName(seniorAdviser) : "—"}</dd>
                </div>
                <div className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Users className="size-4 text-content-muted" aria-hidden />
                  <dt className="text-content-muted w-24 shrink-0">Junior Adviser</dt>
                  <dd className="font-medium text-content">
                    {juniorAdviser ? fullName(juniorAdviser) : "—"}
                    <Link href={`/organizations/${id}`} className="ml-3 text-xs font-semibold text-primary hover:underline">
                      Organization Profile →
                    </Link>
                  </dd>
                </div>
              </dl>
            </div>

            {/* Progress */}
            <div className="flex flex-col items-center justify-center lg:items-end">
              <div className="w-44 h-44 relative">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="88" cy="88" r="72" fill="none" stroke="currentColor" strokeWidth="9" className="text-line" />
                  <circle
                    cx="88"
                    cy="88"
                    r="72"
                    fill="none"
                    strokeWidth="9"
                    strokeDasharray={`${(compliance / 100) * 452.39} 452.39`}
                    strokeLinecap="round"
                    className={compliance === 100 ? "text-success" : compliance >= 50 ? "text-gold" : "text-danger"}
                    style={{ transition: "stroke-dasharray 0.5s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-display text-3xl font-bold text-content">{compliance}%</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-center text-content-secondary">
                {currentRecognition
                  ? `${requirements.filter((r) => r.met).length} of ${requirements.length} requirements complete`
                  : prevRecognition
                  ? "Ready to start renewal"
                  : "No requirements started"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflow Tracker */}
      {activeRec && (
        <Card className="mb-6">
          <CardHeader
            icon={FileStack}
            title={activeRec.kind === "RENEWAL" ? "Renewal Process" : "Application Process"}
            description="Current position in the official workflow."
          />
          <CardContent className="py-2">
            <WorkflowTracker
              process={activeRec.kind === "RENEWAL" ? "RENEWAL" : "RECOGNITION"}
              status={activeRec.status}
            />
            {(activeRec.status === "RETURNED" || activeRec.status === "REJECTED") && (
              <div className="px-1 pb-1 pt-3">
                <Alert
                  tone={activeRec.status === "REJECTED" ? "danger" : "warning"}
                  title={`Application was ${RECOGNITION_STATUS_META[activeRec.status].label.toLowerCase()}`}
                >
                  {activeRec.remarks || "See the timeline below for details."}
                </Alert>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* What's Next / Readiness */}
      {activeRec && (
        <Card className="mb-6">
          <CardContent className="py-5">
            {readiness === "NOT_READY" && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-danger/10 p-2">
                    <AlertCircle className="size-5 text-danger" aria-hidden />
                  </div>
                  <div>
                    <p className="text-base font-bold text-content">Application Not Ready</p>
                    <p className="mt-0.5 text-sm text-content-secondary">
                      {requirements.length - missingRequired.length} of {requirements.length} documents on file —
                      you must complete {missingRequired.length} required item{missingRequired.length > 1 ? "s" : ""} below.
                    </p>
                    {missingRequired.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {missingRequired.map((r) => (
                          <li key={r.key} className="flex items-center gap-2 text-sm text-content-secondary">
                            <CircleDashed className="size-3.5 text-content-muted" aria-hidden />
                            {r.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                {nextAction && nextAction.href !== "#submit-action" && (
                  <Link
                    href={nextAction.href}
                    className="shrink-0 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
                  >
                    Continue Requirements
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                )}
              </div>
            )}

            {readiness === "READY" && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-success/10 p-2">
                    <CheckCircle2 className="size-5 text-success" aria-hidden />
                  </div>
                  <div>
                    <p className="text-base font-bold text-content">Ready for Submission</p>
                    <p className="mt-0.5 text-sm text-content-secondary">
                      All required documents are on file. You can now submit the application to OSAS for review.
                    </p>
                  </div>
                </div>
                <Link
                  href="#submit-action"
                  className="shrink-0 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
                >
                  Submit for Review
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            )}

            {readiness === "SUBMITTED" && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <CheckCircle2 className="size-5 text-primary" aria-hidden />
                  </div>
                  <div>
                    <p className="text-base font-bold text-content">Your Application Has Been Submitted</p>
                    <p className="mt-0.5 text-sm text-content-secondary">
                      Current location:{" "}
                      <span className="font-semibold text-content">{sigState.currentLabel ?? "OSAS review"}</span>
                      <span className="ml-1">· Waiting for: {sigState.currentLabel ? "review and signature" : "OSAS to begin review"}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {readiness === "DECIDED" && (
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-gold/10 p-2">
                  <Award className="size-5 text-gold" aria-hidden />
                </div>
                <div>
                  <p className="text-base font-bold text-content">
                    {activeRec.status === "RECOGNIZED" || activeRec.status === "APPROVED" ? "Recognition Approved" : "Application Decided"}
                  </p>
                  <p className="mt-0.5 text-sm text-content-secondary">
                    This application has concluded with status{" "}
                    <span className="font-semibold">{RECOGNITION_STATUS_META[activeRec.status].label}</span>.
                  </p>
                </div>
              </div>
            )}

            {readiness === null && (
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-surface-secondary p-2">
                  <ShieldQuestion className="size-5 text-content-muted" aria-hidden />
                </div>
                <p className="text-sm text-content-secondary">
                  {currentRecognition ? "This application is not currently submittable." : "No application has been started for this academic year yet."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Requirements */}
      {activeRec && requirements.length > 0 && (
        <Card className="mb-6">
          <CardHeader
            icon={FileText}
            title="Requirements"
            description="Complete all required documents before submitting. Conditional items do not block submission."
          />
          <CardContent>
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-content-secondary">
                  {requirements.filter((r) => r.met).length} of {requirements.length} completed
                </p>
                <p className="text-xs font-bold text-content">{compliance}%</p>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    compliance === 100 ? "bg-success" : compliance >= 50 ? "bg-gold" : "bg-primary"
                  }`}
                  style={{ width: `${compliance}%` }}
                />
              </div>
              {missingRequired.length > 0 && (
                <p className="mt-2 text-xs text-danger">
                  <AlertCircle className="inline size-3.5 mr-1" aria-hidden />
                  {missingRequired.length} item{missingRequired.length > 1 ? "s" : ""} still need attention.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              {requirements.map((item) => (
                <RequirementCard
                  key={item.key}
                  item={item}
                  organizationId={id}
                  academicYear={ay}
                  recognitionKind={activeRec.kind}
                  chainSummary={
                    item.key === "APPLICATION_LETTER" ||
                    item.key === "CONSTITUTION" ||
                    item.key === "SUPPORTING_DOCUMENTS" ||
                    item.key === "ACCOMPLISHMENT_REPORTS" ||
                    item.key === "FINANCIAL_REPORT"
                      ? { completed: sigState.completed, total: sigState.total }
                      : null
                  }
                  lastUpdated={lastUpdatedSource(activeRec.events)}
                />
              ))}
            </div>

            <p className="mt-4 text-xs text-content-secondary">
              Financial Report is required only if the organization has financial activity. For an Initial Recognition,
              Accomplishment Reports are not required because there is no prior organizational cycle.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Document Location / signature chain */}
      {activeRec && (
        <Card className="mb-6">
          <CardHeader
            icon={FileStack}
            title="Document Location & Signature Chain"
            description="Where each signature-routed document is in the official sequence."
          />
          <CardContent>
            <DocumentLocationTracker
              recognition={activeRec}
              requirements={requirements}
            />
          </CardContent>
        </Card>
      )}

      {/* Submission Validation Gate */}
      {activeRec && ["DRAFT", "RETURNED"].includes(activeRec.status) && isOfficer && (
        <Card id="submit-action" className="mb-6 scroll-mt-24">
          <CardHeader
            icon={CheckCircle2}
            title={readiness === "READY" ? "Ready to Submit?" : "Submission Check"}
          />
          <CardContent>
            <SubmissionValidationGate
              recognition={activeRec}
              requirements={requirements}
              organizationId={id}
              academicYear={ay}
            />
          </CardContent>
        </Card>
      )}

      {/* Workflow actions */}
      {activeRec && panels.length > 0 && (
        <Card className="mb-6">
          <CardHeader
            icon={Gavel}
            title="Actions"
            description="Available based on your role and the current status."
          />
          <CardContent className="space-y-5">
            {panels.map((p) => (
              <div key={p.key} className="rounded-xl border border-line p-4">
                <p className="text-sm font-bold text-content">{p.title}</p>
                {p.description && (
                  <p className="mb-3 mt-0.5 text-xs text-content-secondary">{p.description}</p>
                )}
                <ActionForm
                  action={p.action}
                  submitLabel={p.submitLabel}
                  variant={p.variant}
                  footerClassName="mt-3"
                  className="space-y-3"
                >
                  <input type="hidden" name="id" value={activeRec.id} />
                  {p.needNote && (
                    <Field label={p.noteLabel ?? "Note"} htmlFor={`note-${p.key}`} required>
                      <Textarea
                        id={`note-${p.key}`}
                        name="note"
                        rows={3}
                        maxLength={1000}
                        required
                        placeholder="Provide a clear explanation\u2026"
                      />
                    </Field>
                  )}
                </ActionForm>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Interview stage */}
      {activeRec && (showInterviewControls || activeRec.interviewStatus !== "NOT_SCHEDULED") && (
        <Card className="mb-6">
          <CardHeader
            icon={CalendarClock}
            title="Interview"
            description="A distinct stage of the review \u2014 scheduling and outcome are tracked here."
          />
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={INTERVIEW_STATUS_META[activeRec.interviewStatus].tone}>
                {INTERVIEW_STATUS_META[activeRec.interviewStatus].label}
              </Badge>
              {activeRec.interviewAt && (
                <span className="text-sm font-medium text-content">
                  {formatDateTime(activeRec.interviewAt)}
                </span>
              )}
            </div>
            {activeRec.interviewNotes && (
              <p className="whitespace-pre-wrap rounded-lg bg-surface-secondary px-3 py-2 text-sm text-content-secondary">
                {activeRec.interviewNotes}
              </p>
            )}

            {showInterviewControls && activeRec.interviewStatus === "NOT_SCHEDULED" && (
              <ActionForm
                action={scheduleInterview}
                submitLabel="Schedule interview"
                variant="outline"
                footerClassName="mt-3"
                className="space-y-3"
              >
                <input type="hidden" name="id" value={activeRec.id} />
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
                  <Textarea id="interview-note" name="note" rows={2} maxLength={500} placeholder="e.g. OSAS conference room, bring the SF-005 roster\u2026" />
                </Field>
              </ActionForm>
            )}

            {showInterviewControls && activeRec.interviewStatus !== "NOT_SCHEDULED" && (
              <ActionForm
                action={recordInterviewOutcome}
                submitLabel="Record outcome"
                variant="outline"
                footerClassName="mt-3"
                className="space-y-3"
              >
                <input type="hidden" name="id" value={activeRec.id} />
                <Field label="Outcome" htmlFor="interview-outcome" required>
                  <select
                    id="interview-outcome"
                    name="outcome"
                    required
                    defaultValue=""
                    className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                  >
                    <option value="" disabled>
                      Select the result of the interview\u2026
                    </option>
                    <option value="COMPLETED">Completed \u2014 proceed with review</option>
                    <option value="PASSED">Passed</option>
                    <option value="FOR_ADDITIONAL_REVIEW">For additional review</option>
                    <option value="NEEDS_REVISION">Needs revision</option>
                  </select>
                </Field>
                <Field label="Findings (required when needs revision)" htmlFor="interview-findings">
                  <Textarea id="interview-findings" name="note" rows={2} maxLength={1000} placeholder="What was discussed or must be corrected\u2026" />
                </Field>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      )}

      {/* Follow-up stage (§24) */}
      {activeRec && (
        <FollowUpCard
          canReview={canReviewHere}
          followUp={
            activeRec.followUp
              ? {
                  id: activeRec.followUp.id,
                  expectedDate: activeRec.followUp.expectedDate,
                  status: activeRec.followUp.status,
                  notes: activeRec.followUp.notes,
                  completedAt: activeRec.followUp.completedAt,
                  completedBy: activeRec.followUp.completedBy,
                }
              : null
          }
        />
      )}

      {/* Attachments */}
      {activeRec && (
        <AttachmentsCard
          entityType="Recognition"
          entityId={activeRec.id}
          canManage={attachmentParent ? canManageAttachments(user, attachmentParent) : false}
        />
      )}

      {/* Activity / Audit History */}
      {activeRec && (
        <Card className="mb-6">
          <CardHeader
            icon={History}
            title="Activity History"
            description="Audit trail of every action taken on this application."
          />
          <CardContent>
            {timelineItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-content-muted">No activity recorded yet.</p>
            ) : (
              <Timeline items={timelineItems} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Accreditation History */}
      <Card>
        <CardHeader
          icon={Clock}
          title="Accreditation History"
          description="All previous cycles are preserved for audit and reference."
        />
        <CardContent>
          {org.recognitions.length === 0 ? (
            <EmptyState
              icon={Award}
              title="No accreditation history"
              description="This organization has not filed for recognition yet."
            />
          ) : (
            <TableWrap>
              <THead>
                <TH>Academic Year</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH>Progress</TH>
                <TH>Submitted</TH>
                <TH>Decided</TH>
              </THead>
              <tbody>
                {org.recognitions.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">{r.academicYear}</TD>
                    <TD className="text-xs text-content-secondary">
                      {r.kind === "RENEWAL" ? "Renewal" : "Initial"}
                    </TD>
                    <TD>
                      <Badge tone={RECOGNITION_STATUS_META[r.status].tone}>
                        {RECOGNITION_STATUS_META[r.status].label}
                      </Badge>
                    </TD>
                    <TD>
                      {currentRecognition?.id === r.id ? (
                        <span className="text-xs font-medium text-primary">{compliance}%</span>
                      ) : (
                        <span className="text-xs text-content-muted">Archived</span>
                      )}
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-content-secondary">
                      {formatDateTime(r.submittedAt)}
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-content-secondary">
                      {formatDateTime(r.decidedAt)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </>
  );
}
