import "server-only";
import { cache } from "react";
import type { FinancialProcess, SignatoryRole } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { scopedOrgWhere } from "@/lib/auth/rbac";
import type { AuthUser } from "@/lib/auth/session";
import { deadlineAppliesToOrg } from "@/lib/deadlines";

// ---------------------------------------------------------------------------
// Part 12 - Financial structure & financial compliance. These are PURE
// display/rule helpers shared by pages and actions so statuses and labels can
// never drift between the org workspace and the campus-wide views.
//
// The module is DOCUMENT/PROCESS COMPLIANCE, not accounting: it tracks what
// has been filed, reviewed, returned, approved, or archived — never balances,
// forecasts, or "financial health" scores.
// ---------------------------------------------------------------------------

export const FINANCIAL_PROCESS_LABELS: Record<string, string> = {
  RECOGNITION: "Recognition",
  RENEWAL: "Renewal",
  ACTIVITY: "Activity",
  OTHER: "Other",
};

export type FinancialTone = "success" | "danger" | "warning" | "info" | "neutral";

export const FINANCIAL_STATUS_META: Record<string, { tone: FinancialTone; label: string }> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  INCOMPLETE: { tone: "warning", label: "Incomplete" },
  SUBMITTED: { tone: "info", label: "Submitted" },
  UNDER_REVIEW: { tone: "info", label: "Under review" },
  RETURNED: { tone: "danger", label: "Returned" },
  RESUBMITTED: { tone: "info", label: "Resubmitted" },
  APPROVED: { tone: "success", label: "Approved" },
  ARCHIVED: { tone: "neutral", label: "Archived" },
  // Dashboard-only pseudo-statuses (never persisted).
  UNSUBMITTED: { tone: "neutral", label: "Not filed" },
  OVERDUE: { tone: "danger", label: "Overdue" },
};

/** Statuses that count as "filed" for overdue determination. */
export const SUBMITTED_STATES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "RESUBMITTED",
  "APPROVED",
  "ARCHIVED",
] as const;

/** Statuses in which the owning organization may still edit files/submit. */
export function isFinancialEditable(status: string): boolean {
  return ["DRAFT", "INCOMPLETE", "RETURNED", "RESUBMITTED"].includes(status);
}

/** Signatory chain used when a requirement does not define its own (§14). */
export const DEFAULT_FINANCIAL_SIGNERS: SignatoryRole[] = [
  "PRESIDENT",
  "SECRETARY",
  "SENIOR_ADVISER",
  "DEAN",
  "SOA",
  "OSAS",
];

/** Resolve the signing order for a requirement (config-driven, then default). */
export function financialSigningRoles(requirement: { signers: SignatoryRole[] }): SignatoryRole[] {
  return requirement.signers.length > 0 ? requirement.signers : DEFAULT_FINANCIAL_SIGNERS;
}

/** Deadline processes that drive overdue status for a financial process. */
export function deadlineProcessesForFinancial(process: string): string[] {
  switch (process) {
    case "RECOGNITION":
      return ["RECOGNITION", "RENEWAL"];
    case "RENEWAL":
      return ["RECOGNITION", "RENEWAL"];
    case "ACTIVITY":
      return ["ACTIVITY"];
    default:
      return ["OTHER"];
  }
}

/**
 * Derive the submission status from its routing state (§13 single taxonomy).
 * Officer steps (President/Secretary) prepare and route the document; once any
 * reviewing signatory has signed, the submission is Under Review. A version
 * past 1 before a reviewer has acted is a resubmission pending review.
 */
export function derivedFinancialStatus(input: {
  routeState: string | null;
  version: number;
  steps: { role: SignatoryRole; status: string }[];
  persistRef: { resubmittedAt: Date | null; archivedAt: Date | null };
}): string {
  if (input.persistRef.archivedAt) return "ARCHIVED";
  if (!input.routeState) return "DRAFT";

  switch (input.routeState) {
    case "COMPLETED":
      return "APPROVED";
    case "RETURNED_FOR_REVISION":
    case "REJECTED":
      return "RETURNED";
    case "IN_PROGRESS":
    default: {
      const officer = new Set<SignatoryRole>(["PRESIDENT", "SECRETARY"]);
      const reviewerSigned = input.steps.some(
        (s) => !officer.has(s.role) && s.status === "SIGNED"
      );
      if (reviewerSigned) return "UNDER_REVIEW";
      if (input.version > 1) return "RESUBMITTED";
      return "SUBMITTED";
    }
  }
}

/** Whether an unfiled submission is past its applicable financial deadline. */
export function submissionIsOverdue(
  status: string,
  applicableDeadlines: { dueDate: Date }[],
  now = new Date()
): boolean {
  if ((SUBMITTED_STATES as readonly string[]).includes(status)) return false;
  return applicableDeadlines.some((d) => d.dueDate.getTime() < now.getTime());
}

/** File roles within a financial submission (kind tags on Attachment). */
export const FINANCIAL_FILE_KINDS = ["FINANCIAL_DOCUMENT", "FINANCIAL_SUPPORTING"] as const;
export type FinancialFileKind = (typeof FINANCIAL_FILE_KINDS)[number];

export const FINANCIAL_FILE_KIND_LABELS: Record<FinancialFileKind, string> = {
  FINANCIAL_DOCUMENT: "Required document",
  FINANCIAL_SUPPORTING: "Supporting document",
};

export function isFinancialFileKind(value: string | null): value is FinancialFileKind {
  return value != null && (FINANCIAL_FILE_KINDS as readonly string[]).includes(value);
}

export type { FinancialProcess };

// ---------------------------------------------------------------------------
// Compliance dataset. One scoped loader serves both the campus-wide
// dashboard (/financial) and the org financial workspace. "Overdue" is always
// derived from the deadline and never persisted (§19).
// ---------------------------------------------------------------------------

export type FinancialCell = {
  submissionId: string | null;
  /** Display status incl. the pseudo-statuses UNSUBMITTED / OVERDUE. */
  status: string;
  overdue: boolean;
  version: number | null;
  updatedAt: Date | null;
};

export type FinancialCompliance = {
  ay: string;
  orgs: {
    id: string;
    name: string;
    acronym: string | null;
    type: string;
    status: string;
    collegeName: string;
    collegeId: string | null;
  }[];
  requirements: {
    id: string;
    code: string;
    name: string;
    process: FinancialProcess;
    isActive: boolean;
  }[];
  cells: Map<string, Map<string, FinancialCell>>;
};

type DeadlineLiteForFinancial = {
  isActive: boolean;
  process: string;
  academicYear: string;
  dueDate: Date;
  scopeType: import("@/generated/prisma/client").DeadlineScope;
  scopeCollegeId: string | null;
};

export function applicableFinancialDeadlines(
  requirement: { process: string },
  org: { type: string; collegeId: string | null },
  ay: string,
  deadlines: DeadlineLiteForFinancial[]
): DeadlineLiteForFinancial[] {
  const procs = deadlineProcessesForFinancial(requirement.process);
  return deadlines
    .filter((d) => d.academicYear === ay && procs.includes(d.process))
    .filter((d) => deadlineAppliesToOrg(d, { type: org.type, collegeId: org.collegeId ?? "" }));
}

/** A cell that may still be filed (open slots) is the only kind that is overdue. */
function isOpeningStatus(status: string): boolean {
  return status === "UNSUBMITTED" || status === "DRAFT" || status === "INCOMPLETE";
}

export async function buildFinancialCompliance(
  user: AuthUser,
  ay: string
): Promise<FinancialCompliance> {
  const orgRows = await db.organization.findMany({
    where: scopedOrgWhere(user, {}),
    select: {
      id: true,
      name: true,
      acronym: true,
      type: true,
      status: true,
      collegeId: true,
      college: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  const orgIds = orgRows.map((o) => o.id);

  const [requirementRows, submissionRows, deadlineRows] = await Promise.all([
    db.financialRequirement.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, process: true, isActive: true },
      orderBy: [{ process: "asc" }, { code: "asc" }],
    }),
    db.financialSubmission.findMany({
      where: { organizationId: { in: orgIds }, academicYear: ay },
      select: {
        id: true,
        organizationId: true,
        requirementId: true,
        status: true,
        version: true,
        submittedAt: true,
        updatedAt: true,
        archivedAt: true,
        resubmittedAt: true,
      },
    }),
    db.deadline.findMany({
      where: { isActive: true },
      select: { isActive: true, process: true, academicYear: true, dueDate: true, scopeType: true, scopeCollegeId: true },
    }),
  ]);

  const routeRows = await db.signatureRoute.findMany({
    where: {
      entityType: "FinancialSubmission",
      entityId: { in: submissionRows.map((s) => s.id) },
    },
    select: {
      entityId: true,
      state: true,
      version: true,
      steps: { select: { role: true, status: true } },
    },
  });
  const routeBySub = new Map(routeRows.map((r) => [r.entityId, r]));

  const cells = new Map<string, Map<string, FinancialCell>>();
  for (const org of orgRows) {
    const row = new Map<string, FinancialCell>();
    for (const req of requirementRows) {
      const sub = submissionRows.find(
        (s) => s.organizationId === org.id && s.requirementId === req.id
      );
      const due = applicableFinancialDeadlines(req, org, ay, deadlineRows);
      if (!sub) {
        const overdue = submissionIsOverdue("UNSUBMITTED", due.map((d) => ({ dueDate: d.dueDate })));
        row.set(req.id, {
          submissionId: null,
          status: overdue ? "OVERDUE" : "UNSUBMITTED",
          overdue,
          version: null,
          updatedAt: null,
        });
        continue;
      }
      const route = routeBySub.get(sub.id);
      const raw = route
        ? derivedFinancialStatus({
            routeState: route.state,
            version: route.version,
            steps: route.steps,
            persistRef: { resubmittedAt: sub.resubmittedAt, archivedAt: sub.archivedAt },
          })
        : sub.status;
      const overdue = submissionIsOverdue(
        raw,
        due.map((d) => ({ dueDate: d.dueDate }))
      );
      row.set(req.id, {
        submissionId: sub.id,
        status: overdue && isOpeningStatus(raw) ? "OVERDUE" : raw,
        overdue,
        version: sub.version,
        updatedAt: sub.updatedAt,
      });
    }
    cells.set(org.id, row);
  }

  return {
    ay,
    orgs: orgRows.map((o) => ({
      id: o.id,
      name: o.name,
      acronym: o.acronym,
      type: o.type,
      status: o.status,
      collegeName: o.college?.name ?? "",
      collegeId: o.collegeId,
    })),
    requirements: requirementRows,
    cells,
  };
}

export const buildFinancialComplianceMemo = cache(buildFinancialCompliance);

/** Flat counters for the dashboard cards (exact statuses; group in the UI). */
export function countFinancialStatuses(cells: Map<string, Map<string, FinancialCell>>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of cells.values()) {
    for (const cell of row.values()) {
      counts[cell.status] = (counts[cell.status] ?? 0) + 1;
    }
  }
  return counts;
}