import type {
  ActivityPhase,
  OrgApplicationStatus,
  ProposalStatus,
  RecognitionStatus,
  ReportStatus,
  Role,
  SignatoryRole,
} from "@/generated/prisma/client";
import { FORM_ROUTES, SIGNATORY_LABELS } from "@/lib/form-routes";
import type { Permission } from "@/lib/auth/rbac";

// ---------------------------------------------------------------------------
// Workflow/state rules — single source of truth for every routed document.
//
// Master-prompt §6: do NOT hard-code one workflow for every document. Each
// process declares its own ordered tracker steps, who is expected to act at
// each status, and exactly which transitions are legal (and with which
// minimum permission). Signature gating (§8) is enforced at the object level
// by the module actions (bound adviser, dean college scope, OSAS-only confer)
// on top of the permission declared here.
//
// The tracker UI and the server actions both read these defs, so the visible
// status/next-action can never contradict what the backend enforces.
// ---------------------------------------------------------------------------

export type ProcessKey =
  | "ORG_APPLICATION"
  | "RECOGNITION"
  | "RENEWAL"
  | "ACTIVITY_PROPOSAL"
  | "ACCOMPLISHMENT_REPORT"
  | "SF_FORM";

export type WorkflowStep<S extends string = string> = { status: S; label: string };

/** The CURRENT LOCATION / CURRENT ACTION / NEXT STEP block (§32). */
export type GateRule<S extends string = string> = {
  status: S;
  label: string;      // status badge
  role: Role | null;  // expected actor role at this status (null = no one acts)
  roleLabel: string;  // tracker node name, e.g. "Senior Adviser"
  action: string;     // what that role must do
  next: string;       // what happens after their action
};

export type TransitionRule<S extends string = string> = {
  action: string;         // e.g. "START_REVIEW"
  label: string;          // "Start review"
  from: readonly S[];
  to: S;
  needNote?: boolean;     // a decision note is mandatory
  /** Minimum permission the acting role must hold. */
  permission: Permission;
  /** Side-effect phase change carried by the transition (activity phase). */
  nextPhase?: string;
};

export type WorkflowDef<S extends string = string> = {
  key: ProcessKey;
  label: string;
  /** Ordered tracker steps — the "① President ✓ ② Secretary ✓ …" strip. */
  steps: readonly WorkflowStep<S>[];
  /** Current-location table: status → who acts / what / what's next. */
  gates: Partial<Record<S, Omit<GateRule<S>, "status">>>;
  /** Legal state-machine transitions. */
  transitions: readonly TransitionRule<S>[];
  /** Revision state that returned documents land in. */
  returnTo: S;
  /** Terminal rejection state. */
  rejectTo: S;
  /** Terminal statuses — no one can act on them. */
  terminal: readonly S[];
  /** Statuses the filing officer may edit. */
  editableStates: readonly S[];
};

export function stepIndex<S extends string>(def: WorkflowDef<S>, status: S): number {
  // -1 means "off the linear strip" (RETURNED/REJECTED render as alerts).
  return def.steps.findIndex((s) => s.status === status);
}

/**
 * Statuses a document passes through while "in flight" — every step after the
 * initial DRAFT and before a terminal state. Dashboards/analytics count open
 * work from this instead of duplicating the chain.
 */
export function inFlightStatuses<S extends string>(def: WorkflowDef<S>): S[] {
  return def.steps
    .slice(1)
    .filter((s) => !def.terminal.includes(s.status))
    .map((s) => s.status);
}

export function currentAction<S extends string>(def: WorkflowDef<S>, status: S): GateRule<S> | null {
  const gate = def.gates[status] as Omit<GateRule<S>, "status"> | undefined;
  return gate ? { status, ...gate } : null;
}

export function transitionFor<S extends string>(
  def: WorkflowDef<S>,
  action: string
): TransitionRule<S> | undefined {
  return def.transitions.find((t) => t.action === action);
}

export function allowedTransitions<S extends string>(def: WorkflowDef<S>, status: S): TransitionRule<S>[] {
  return def.transitions.filter((t) => t.from.includes(status));
}

// ---------------------------------------------------------------------------
// §3/§5/§29  Organization application (President-created → review chain).
// DRAFT → SUBMITTED → UNDER_REVIEW → FOR_SIGNATURE → FOR_APPROVAL → APPROVED
// → RECOGNIZED; RETURNED/REJECTED off-strip.
// ---------------------------------------------------------------------------

export const ORG_APPLICATION_WORKFLOW: WorkflowDef<OrgApplicationStatus> = {
  key: "ORG_APPLICATION",
  label: "Organization application",
  steps: [
    { status: "DRAFT", label: "Draft" },
    { status: "SUBMITTED", label: "For Review" },
    { status: "UNDER_REVIEW", label: "Adviser Review" },
    { status: "FOR_SIGNATURE", label: "Dean Review" },
    { status: "FOR_APPROVAL", label: "SOA Review" },
    { status: "APPROVED", label: "OSAS Approval" },
    { status: "RECOGNIZED", label: "Recognized" },
  ],
  gates: {
    DRAFT: {
      label: "Draft",
      role: "PRESIDENT",
      roleLabel: "President",
      action: "Complete the application and submit it",
      next: "Senior Adviser review",
    },
    SUBMITTED: {
      label: "For Review",
      role: "ADVISER_REGULAR",
      roleLabel: "Senior Adviser",
      action: "Review the application",
      next: "Adviser decision (approve or return)",
    },
    UNDER_REVIEW: {
      label: "Adviser Review",
      role: "ADVISER_REGULAR",
      roleLabel: "Senior Adviser",
      action: "Approve the application",
      next: "Dean review",
    },
    FOR_SIGNATURE: {
      label: "Dean Review",
      role: "DEAN",
      roleLabel: "College Dean",
      action: "Review and sign the application",
      next: "SOA review",
    },
    FOR_APPROVAL: {
      label: "SOA Review",
      role: "SOA",
      roleLabel: "SOA",
      action: "Review and approve the application",
      next: "OSAS approval",
    },
    APPROVED: {
      label: "OSAS Approval",
      role: "OSAS",
      roleLabel: "OSAS",
      action: "Confer official recognition",
      next: "Recognized",
    },
    RECOGNIZED: {
      label: "Recognized",
      role: null,
      roleLabel: "—",
      action: "No action required",
      next: "—",
    },
    RETURNED: {
      label: "Revision Required",
      role: "PRESIDENT",
      roleLabel: "President",
      action: "Revise the application and resubmit it",
      next: "Senior Adviser re-review",
    },
    REJECTED: {
      label: "Rejected",
      role: null,
      roleLabel: "—",
      action: "No action required",
      next: "—",
    },
  },
  transitions: [
    { action: "SUBMIT", label: "Submit application", from: ["DRAFT", "RETURNED"], to: "SUBMITTED", permission: "org.submit" },
    { action: "START_REVIEW", label: "Start review", from: ["SUBMITTED"], to: "UNDER_REVIEW", permission: "org.review" },
    { action: "ADVISER_APPROVE", label: "Approve application", from: ["UNDER_REVIEW"], to: "FOR_SIGNATURE", permission: "org.review" },
    { action: "DEAN_APPROVE", label: "Review and sign", from: ["FOR_SIGNATURE"], to: "FOR_APPROVAL", permission: "org.approve" },
    { action: "SOA_APPROVE", label: "Approve application", from: ["FOR_APPROVAL"], to: "APPROVED", permission: "org.approve" },
    { action: "CONFER", label: "Confer recognition", from: ["APPROVED"], to: "RECOGNIZED", permission: "org.approve" },
    { action: "RETURN", label: "Return for revision", from: ["SUBMITTED", "UNDER_REVIEW", "FOR_SIGNATURE", "FOR_APPROVAL", "APPROVED"], to: "RETURNED", needNote: true, permission: "org.review" },
    { action: "REJECT", label: "Reject application", from: ["SUBMITTED", "UNDER_REVIEW", "FOR_SIGNATURE", "FOR_APPROVAL", "APPROVED"], to: "REJECTED", needNote: true, permission: "org.approve" },
  ],
  returnTo: "RETURNED",
  rejectTo: "REJECTED",
  terminal: ["RECOGNIZED", "REJECTED"],
  editableStates: ["DRAFT", "RETURNED"],
};

// ---------------------------------------------------------------------------
// §11/§29  Recognition & renewal (per AY). Configured differently from the
// org application on purpose (§6): interview stage, adviser endorsement and
// signature-forwarding live inside this chain.
// ---------------------------------------------------------------------------

export const RECOGNITION_WORKFLOW: WorkflowDef<RecognitionStatus> = {
  key: "RECOGNITION",
  label: "Recognition application",
  steps: [
    { status: "DRAFT", label: "Draft" },
    { status: "SUBMITTED", label: "Submitted" },
    { status: "UNDER_REVIEW", label: "Under Review" },
    { status: "FOR_APPROVAL", label: "For Approval" },
    { status: "FOR_SIGNATURE", label: "For Signature" },
    { status: "RECOGNIZED", label: "Recognized" },
  ],
  gates: {
    DRAFT: {
      label: "Draft",
      role: "PRESIDENT",
      roleLabel: "President",
      action: "Complete the application and submit it",
      next: "Review",
    },
    SUBMITTED: {
      label: "Submitted",
      role: "ADVISER_REGULAR",
      roleLabel: "Senior Adviser",
      action: "Start the review",
      next: "Adviser endorsement",
    },
    UNDER_REVIEW: {
      label: "Under Review",
      role: "ADVISER_REGULAR",
      roleLabel: "Senior Adviser",
      action: "Endorse for approval",
      next: "For approval",
    },
    FOR_APPROVAL: {
      label: "For Approval",
      role: "DEAN",
      roleLabel: "College Dean",
      action: "Forward for signature",
      next: "For signature",
    },
    FOR_SIGNATURE: {
      label: "For Signature",
      role: "SOA",
      roleLabel: "SOA",
      action: "Approve the application",
      next: "Official recognition",
    },
    APPROVED: {
      label: "Approved",
      role: "OSAS",
      roleLabel: "OSAS",
      action: "Confer official recognition",
      next: "Recognized",
    },
    RECOGNIZED: {
      label: "Recognized",
      role: null,
      roleLabel: "—",
      action: "No action required",
      next: "—",
    },
    RETURNED: {
      label: "Returned",
      role: "PRESIDENT",
      roleLabel: "President",
      action: "Revise the application and resubmit it",
      next: "Re-review",
    },
    REJECTED: {
      label: "Rejected",
      role: null,
      roleLabel: "—",
      action: "No action required",
      next: "—",
    },
    EXPIRED: {
      label: "Expired",
      role: null,
      roleLabel: "—",
      action: "No action required",
      next: "—",
    },
  },
  transitions: [
    { action: "SUBMIT", label: "Submit application", from: ["DRAFT", "RETURNED"], to: "SUBMITTED", permission: "recognition.submit" },
    { action: "START_REVIEW", label: "Start review", from: ["SUBMITTED"], to: "UNDER_REVIEW", permission: "recognition.review" },
    { action: "ENDORSE", label: "Endorse for approval", from: ["UNDER_REVIEW"], to: "FOR_APPROVAL", permission: "recognition.review" },
    { action: "ADVANCE_TO_SIGNATURE", label: "Forward for signature", from: ["FOR_APPROVAL"], to: "FOR_SIGNATURE", permission: "recognition.review" },
    { action: "RETURN", label: "Return for revision", from: ["SUBMITTED", "UNDER_REVIEW", "FOR_APPROVAL"], to: "RETURNED", needNote: true, permission: "recognition.review" },
    { action: "APPROVE", label: "Approve application", from: ["FOR_SIGNATURE"], to: "APPROVED", permission: "recognition.approve" },
    { action: "REJECT", label: "Reject application", from: ["SUBMITTED", "UNDER_REVIEW", "FOR_APPROVAL", "FOR_SIGNATURE"], to: "REJECTED", needNote: true, permission: "recognition.approve" },
    { action: "CONFER", label: "Confer recognition", from: ["APPROVED"], to: "RECOGNIZED", permission: "recognition.approve" },
  ],
  returnTo: "RETURNED",
  rejectTo: "REJECTED",
  terminal: ["RECOGNIZED", "APPROVED", "REJECTED", "EXPIRED"],
  editableStates: ["DRAFT", "RETURNED"],
};

/** §11: renewal reuses the recognition application, not a new organization. */
export const RENEWAL_WORKFLOW: WorkflowDef<RecognitionStatus> = {
  ...RECOGNITION_WORKFLOW,
  key: "RENEWAL",
  label: "Recognition renewal",
};

// ---------------------------------------------------------------------------
// §20/§22  Activity proposal (plan → proposal → endorsement → approval →
// implementation → accomplishment → archive).
// ---------------------------------------------------------------------------

export const ACTIVITY_WORKFLOW: WorkflowDef<ProposalStatus> = {
  key: "ACTIVITY_PROPOSAL",
  label: "Activity proposal",
  steps: [
    { status: "DRAFT", label: "Draft" },
    { status: "SUBMITTED", label: "Submitted" },
    { status: "ENDORSED", label: "Endorsed" },
    { status: "APPROVED", label: "Approved" },
  ],
  gates: {
    DRAFT: {
      label: "Draft",
      role: "PRESIDENT",
      roleLabel: "President",
      action: "Complete the proposal and submit it",
      next: "Adviser endorsement",
    },
    SUBMITTED: {
      label: "Submitted",
      role: "ADVISER_REGULAR",
      roleLabel: "Senior Adviser",
      action: "Endorse the proposal",
      next: "Approval",
    },
    ENDORSED: {
      label: "Endorsed",
      role: "SOA",
      roleLabel: "SOA",
      action: "Approve the proposal",
      next: "Implementation",
    },
    APPROVED: {
      label: "Approved",
      role: null,
      roleLabel: "Organization",
      action: "Conduct the activity and record attendance/evidence",
      next: "Accomplishment report",
    },
    RETURNED: {
      label: "Returned",
      role: "PRESIDENT",
      roleLabel: "President",
      action: "Revise the proposal and resubmit it",
      next: "Re-review",
    },
    REJECTED: {
      label: "Rejected",
      role: null,
      roleLabel: "—",
      action: "No action required",
      next: "—",
    },
  },
  transitions: [
    { action: "SUBMIT", label: "Submit proposal", from: ["DRAFT", "RETURNED"], to: "SUBMITTED", permission: "activity.submit", nextPhase: "PROPOSAL" },
    { action: "ENDORSE", label: "Endorse proposal", from: ["SUBMITTED"], to: "ENDORSED", permission: "activity.approve", nextPhase: "APPROVAL" },
    { action: "RETURN", label: "Return for revision", from: ["SUBMITTED", "ENDORSED"], to: "RETURNED", needNote: true, permission: "activity.approve" },
    { action: "APPROVE", label: "Approve proposal", from: ["ENDORSED"], to: "APPROVED", permission: "activity.approve", nextPhase: "IMPLEMENTATION" },
    { action: "REJECT", label: "Reject proposal", from: ["SUBMITTED", "ENDORSED"], to: "REJECTED", needNote: true, permission: "activity.approve" },
  ],
  returnTo: "RETURNED",
  rejectTo: "REJECTED",
  terminal: ["APPROVED", "REJECTED"],
  editableStates: ["DRAFT", "RETURNED"],
};

/** §22: the phase dimension shown alongside an activity's approval status. */
export const ACTIVITY_PHASES: readonly WorkflowStep<ActivityPhase>[] = [
  { status: "PLAN", label: "Planning" },
  { status: "PROPOSAL", label: "Proposal" },
  { status: "APPROVAL", label: "Approval" },
  { status: "IMPLEMENTATION", label: "Implementation" },
  { status: "MONITORING", label: "Monitoring" },
  { status: "ACCOMPLISHMENT", label: "Accomplishment" },
  { status: "ARCHIVE", label: "Archive" },
];

// ---------------------------------------------------------------------------
// §24  Accomplishment report (officer submits → reviewer accepts / returns).
// ---------------------------------------------------------------------------

export const REPORT_WORKFLOW: WorkflowDef<ReportStatus> = {
  key: "ACCOMPLISHMENT_REPORT",
  label: "Accomplishment report",
  steps: [
    { status: "DRAFT", label: "Draft" },
    { status: "SUBMITTED", label: "Submitted" },
    { status: "ACCEPTED", label: "Accepted" },
  ],
  gates: {
    DRAFT: {
      label: "Draft",
      role: "PRESIDENT",
      roleLabel: "President",
      action: "Complete the report and submit it",
      next: "Review",
    },
    SUBMITTED: {
      label: "Pending",
      role: "OSAS",
      roleLabel: "OSAS / SOA",
      action: "Review and accept the report",
      next: "Accepted",
    },
    ACCEPTED: {
      label: "Accepted",
      role: null,
      roleLabel: "—",
      action: "No action required",
      next: "—",
    },
    RETURNED: {
      label: "Returned",
      role: "PRESIDENT",
      roleLabel: "President",
      action: "Revise the report and resubmit it",
      next: "Re-review",
    },
  },
  transitions: [
    { action: "SUBMIT", label: "Submit report", from: ["DRAFT", "RETURNED"], to: "SUBMITTED", permission: "activity.submit" },
    { action: "RETURN", label: "Return for revision", from: ["SUBMITTED"], to: "RETURNED", needNote: true, permission: "activity.approve" },
    { action: "ACCEPT", label: "Accept report", from: ["SUBMITTED"], to: "ACCEPTED", permission: "activity.approve" },
  ],
  returnTo: "RETURNED",
  // Reports have no rejection state — a returned report is the terminal
  // corrective path a reviewer can take; resubmission re-enters SUBMITTED.
  rejectTo: "RETURNED",
  terminal: ["ACCEPTED"],
  editableStates: ["DRAFT", "RETURNED"],
};

// ---------------------------------------------------------------------------
// §6/§8  SF forms — routed through a signatory SEQUENCE (SignatureStep
// LOCKED→CURRENT→SIGNED) rather than a status chain. Enforcement already lives
// in signature-routing.ts; this derives the same tracker data from FORM_ROUTES
// so the sequence shown to the user always matches the enforced one.
// ---------------------------------------------------------------------------

export type SFRouteStep = { role: SignatoryRole; roleLabel: string; action: string; next: string };

export function sfWorkflow(formKey: string): WorkflowDef<SignatoryRole> {
  const roles = FORM_ROUTES[formKey] ?? [];
  const steps = roles.map((role) => ({ status: role, label: SIGNATORY_LABELS[role] }));
  const gates = Object.fromEntries(
    roles.map((role, i) => {
      const next = roles[i + 1] ? SIGNATORY_LABELS[roles[i + 1]] : "Document complete";
      return [
        role,
        {
          label: SIGNATORY_LABELS[role],
          roleLabel: SIGNATORY_LABELS[role],
          action: "Review and sign",
          next,
        },
      ];
    })
  ) as Partial<Record<SignatoryRole, Omit<GateRule<SignatoryRole>, "status">>>;
  return {
    key: "SF_FORM",
    label: formKey,
    steps,
    gates,
    transitions: [],
    returnTo: "RETURN" as SignatoryRole,
    rejectTo: "REJECT" as SignatoryRole,
    terminal: [],
    editableStates: [],
  };
}

export function stepLabel<S extends string>(def: WorkflowDef<S>, status: S): string | null {
  return def.steps.find((s) => s.status === status)?.label ?? null;
}

/** Registry of every process — what the compliance matrix and dashboards read. */
export const WORKFLOWS: WorkflowDef<string>[] = [
  ORG_APPLICATION_WORKFLOW,
  RECOGNITION_WORKFLOW,
  RENEWAL_WORKFLOW,
  ACTIVITY_WORKFLOW,
  REPORT_WORKFLOW,
] as unknown as WorkflowDef<string>[];