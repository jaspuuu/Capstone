import type { Organization, Recognition } from "@/generated/prisma/client";
import { compareAcademicYear, currentAcademicYear } from "@/lib/utils";

/**
 * The user-facing state of an organization derived from its recognition
 * history (§14): Active / Recognized / Pending Renewal / Expired / Inactive /
 * Rejected. Purely computed - never stored - so it can never drift.
 */
export type OrgState =
  | "RECOGNIZED"
  | "PENDING_RENEWAL"
  | "EXPIRED"
  | "INACTIVE"
  | "REJECTED"
  | "ACTIVE";

const SATISFIED = new Set(["APPROVED", "RECOGNIZED"]);

export function deriveOrgState(
  org: Pick<Organization, "status">,
  recognitions: Pick<Recognition, "academicYear" | "status">[]
): OrgState {
  if (org.status === "INACTIVE") return "INACTIVE";

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

  return "ACTIVE";
}

/** Workflow steps shown on the recognition progress bar (§13, §46). */
export const RECOGNITION_STEPS = [
  { key: "DRAFT", label: "Draft" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "UNDER_REVIEW", label: "Under Review" },
  { key: "FOR_APPROVAL", label: "For Approval" },
  { key: "RECOGNIZED", label: "Recognized" },
] as const;

/** Activity proposal pipeline: file → endorse → approve → (report accepted). */
export const ACTIVITY_STEPS = [
  { key: "DRAFT", label: "Draft" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "ENDORSED", label: "Endorsed" },
  { key: "APPROVED", label: "Approved" },
  { key: "COMPLETED", label: "Completed" },
] as const;

export function activityStepIndex(status: string): number {
  switch (status) {
    case "DRAFT":
      return 0;
    case "SUBMITTED":
      return 1;
    case "ENDORSED":
      return 2;
    case "APPROVED":
      return 3;
    case "COMPLETED":
      return 4;
    default:
      return -1; // RETURNED / REJECTED render as alerts instead
  }
}

export const REPORT_STEPS = [
  { key: "DRAFT", label: "Draft" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "ACCEPTED", label: "Accepted" },
] as const;

export function reportStepIndex(status: string): number {
  switch (status) {
    case "DRAFT":
      return 0;
    case "SUBMITTED":
      return 1;
    case "ACCEPTED":
      return 2;
    default:
      return -1; // RETURNED renders as an alert instead
  }
}

export function recognitionStepIndex(status: string): number {
  switch (status) {
    case "DRAFT":
      return 0;
    case "SUBMITTED":
      return 1;
    case "UNDER_REVIEW":
      return 2;
    case "FOR_APPROVAL":
      return 3;
    case "APPROVED":
    case "RECOGNIZED":
      return 4;
    default:
      return -1; // RETURNED / REJECTED / EXPIRED render on the timeline instead
  }
}
