import type { Organization, Recognition } from "@/generated/prisma/client";
import { compareAcademicYear, currentAcademicYear } from "@/lib/utils";
import {
  ACTIVITY_PHASES,
  RECOGNITION_WORKFLOW,
  REPORT_WORKFLOW,
} from "@/lib/workflow";

/**
 * The user-facing state of an organization derived from its application
 * lifecycle and recognition history (§5, §14): Draft / For Review / Revision
 * Required / Recognized / Pending Renewal / etc. Purely computed - never
 * stored - so it can never drift.
 */
export type OrgState =
  | "RECOGNIZED"
  | "PENDING_RENEWAL"
  | "EXPIRED"
  | "INACTIVE"
  | "REJECTED"
  | "ACTIVE"
  | "DRAFT"
  | "FOR_REVIEW"
  | "REVISION_REQUIRED";

const SATISFIED = new Set(["APPROVED", "RECOGNIZED"]);

// Organization application statuses that mean "the application is in the
// hands of reviewers" (as opposed to with the president).
const IN_REVIEW = new Set([
  "SUBMITTED",
  "UNDER_REVIEW",
  "FOR_SIGNATURE",
  "FOR_APPROVAL",
  "APPROVED",
]);

export function deriveOrgState(
  org: Pick<Organization, "status" | "applicationStatus">,
  recognitions: Pick<Recognition, "academicYear" | "status">[]
): OrgState {
  if (org.status === "INACTIVE") return "INACTIVE";

  // §5: a freshly-created organization is not yet active/recognized. Only a
  // RECOGNIZED application means the org is established; everything before
  // that is the creation workflow, fronted by the President.
  if (org.applicationStatus !== "RECOGNIZED") {
    switch (org.applicationStatus) {
      case "DRAFT":
        return "DRAFT";
      case "RETURNED":
        return "REVISION_REQUIRED";
      case "REJECTED":
        return "REJECTED";
      default:
        return IN_REVIEW.has(org.applicationStatus) ? "FOR_REVIEW" : "DRAFT";
    }
  }

  const ay = currentAcademicYear();
  const sorted = [...recognitions].sort((a, b) =>
    compareAcademicYear(b.academicYear, a.academicYear)
  );

  const current = sorted.find((r) => r.academicYear === ay);
  if (current && SATISFIED.has(current.status)) return "RECOGNIZED";

  // A pending application for the current year means the org is working on
  // (re)establishing recognition - it is still an active organization.
  const hasPendingCurrent = sorted.some(
    (r) =>
      r.academicYear === ay &&
      ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "FOR_APPROVAL", "RETURNED"].includes(r.status)
  );
  if (hasPendingCurrent) {
    return sorted.some((r) => compareAcademicYear(r.academicYear, ay) < 0 && SATISFIED.has(r.status))
      ? "PENDING_RENEWAL"
      : "ACTIVE";
  }

  const lastSatisfied = sorted.find((r) => SATISFIED.has(r.status));
  if (lastSatisfied) {
    // Recognized in a previous academic year with nothing filed since.
    return compareAcademicYear(lastSatisfied.academicYear, ay) < 0 ? "PENDING_RENEWAL" : "RECOGNIZED";
  }

  const latest = sorted[0];
  if (latest?.status === "REJECTED") return "REJECTED";

  // An org whose application passed all reviews is established.
  return "RECOGNIZED";
}

/** Workflow steps shown on the recognition progress bar (§11, §29). */
export const RECOGNITION_STEPS = RECOGNITION_WORKFLOW.steps.map((s) => ({
  key: s.status,
  label: s.label,
}));

/**
 * Activity phase strip (§22): the phase dimension displayed on the activity
 * page. Derived from the shared phase array; ACCOMPLISHMENT/ARCHIVE both rest
 * on the last displayed step.
 */
const ACTIVITY_STRIP_KEYS = ["PLAN", "PROPOSAL", "APPROVAL", "IMPLEMENTATION", "ACCOMPLISHMENT"] as const;

export const ACTIVITY_STEPS = ACTIVITY_PHASES.filter((s) =>
  (ACTIVITY_STRIP_KEYS as readonly string[]).includes(s.status)
).map((s) => ({ key: s.status, label: s.label }));

export function activityStepIndex(phase: string): number {
  const i = ACTIVITY_PHASES.findIndex((s) => s.status === phase);
  if (i < 0) return -1;
  return Math.min(i, ACTIVITY_STEPS.length - 1);
}

export const REPORT_STEPS = REPORT_WORKFLOW.steps.map((s) => ({
  key: s.status,
  label: s.label,
}));

export function reportStepIndex(status: string): number {
  return REPORT_WORKFLOW.steps.findIndex((s) => s.status === status);
}

export function recognitionStepIndex(status: string): number {
  const i = RECOGNITION_WORKFLOW.steps.findIndex((s) => s.status === status);
  if (i >= 0) return i;
  // APPROVED sits just past the strip (conferral is the next action) — render
  // it on the final recognized step, matching the legacy progress bar.
  if (status === "APPROVED") return RECOGNITION_WORKFLOW.steps.length - 1;
  return -1;
}
