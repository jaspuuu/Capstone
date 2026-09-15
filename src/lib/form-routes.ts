import type { SignatoryRole } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Form-specific signatory sequences (§8). Each SF form defines exactly which
// signatories it needs and in what order — there is no universal sequence.
// Add or reorder entries here to change routing without touching workflows.
// ---------------------------------------------------------------------------

export const SIGNATORY_LABELS: Record<SignatoryRole, string> = {
  PRESIDENT: "President",
  SECRETARY: "Secretary",
  SENIOR_ADVISER: "Senior Adviser",
  JUNIOR_ADVISER: "Junior Adviser",
  DEAN: "Dean",
  SOA: "SOA",
  OSAS: "OSAS",
};

export const FORM_ROUTES: Record<string, SignatoryRole[]> = {
  // Recognition application packet — routed through the office to OSAS for
  // final approval (the printed "Noted: SOA/OSAS" approvers block).
  SF001: ["PRESIDENT", "SECRETARY", "SENIOR_ADVISER", "DEAN", "SOA", "OSAS"],
  // Renewal request letter — routed up to OSAS for final approval.
  SF002: ["PRESIDENT", "SENIOR_ADVISER", "DEAN", "SOA", "OSAS"],
  // Adviser commitment — countersigned by the unit, not OSAS.
  SF003: ["PRESIDENT", "SECRETARY", "SENIOR_ADVISER", "DEAN"],
  // Plan of activities — prepared by org officers, endorsed through OSAS.
  SF004: ["PRESIDENT", "SECRETARY", "SENIOR_ADVISER", "DEAN", "SOA", "OSAS"],
  // List of members — organization-side document.
  SF005: ["PRESIDENT", "SECRETARY", "SENIOR_ADVISER"],
  // Dean's certification of bonafide membership, noted by OSAS.
  SF006: ["SENIOR_ADVISER", "DEAN", "OSAS"],
};

export function formRoute(formKey: string): SignatoryRole[] {
  return FORM_ROUTES[formKey] ?? [];
}

/** Stable identity for one routing instance: per form, org, and AY. */
export function sfRouteEntityId(formKey: string, orgId: string, ay: string): string {
  return `${formKey}:${orgId}:${ay}`;
}

/** Signature-routed forms, in library order — shared by the document workflow
 * tracker and the adviser "awaiting your signature" surface. */
export const SIGNATURE_FORM_ORDER = ["SF001", "SF002", "SF003", "SF004", "SF005", "SF006"] as const;

export const FORM_META: Record<
  (typeof SIGNATURE_FORM_ORDER)[number],
  { code: string; title: string; href: string }
> = {
  SF001: { code: "SF-001", title: "Application for Recognition/Renewal", href: "/forms/sf-001" },
  SF002: { code: "SF-002", title: "Organization Renewal Form", href: "/forms/sf-002" },
  SF003: { code: "SF-003", title: "Organization Adviser Commitment Form", href: "/forms/sf-003" },
  SF004: { code: "SF-004", title: "Plan of Activities", href: "/forms/sf-004" },
  SF005: { code: "SF-005", title: "List of Members", href: "/forms/sf-005" },
  SF006: { code: "SF-006", title: "Certification", href: "/forms/sf-006" },
};

/** The four non-ISO document upload requirements (no official SF form —
 * Constitution & By-Laws, Financial Report, Accomplishment Report, and
 * supporting documents). These open a dedicated requirement upload page. */
export const DOCUMENT_REQUIREMENT_KEYS = [
  "CONSTITUTION",
  "FINANCIAL_REPORT",
  "ACCOMPLISHMENT_REPORTS",
  "SUPPORTING_DOCUMENTS",
] as const;

export function isDocumentRequirement(key: string): boolean {
  return (DOCUMENT_REQUIREMENT_KEYS as readonly string[]).includes(key);
}

/**
 * Where each SF-001 checklist item is completed. The six official ISO forms
 * (SF-001…SF-006) keep their editable official-form workspace; documents with
 * no ISO form (constitution / financial report / accomplishment / supporting)
 * open a dedicated, requirement-scoped upload page.
 */
export function requirementFormRoute(
  key: string,
  orgId: string,
  ay: string,
  kind?: string
): string {
  if (!orgId || !ay) return `/organizations/${orgId}/accreditation`;
  const q = `org=${encodeURIComponent(orgId)}&ay=${encodeURIComponent(ay)}`;
  if (isDocumentRequirement(key)) {
    return `/organizations/${orgId}/accreditation/requirements/${key}?${q}`;
  }
  switch (key) {
    case "APPLICATION_LETTER":
      return kind === "RENEWAL" ? `/forms/sf-002?${q}` : `/forms/sf-001?${q}`;
    case "ADVISER_COMMITMENT":
      return `/forms/sf-003?${q}`;
    case "PLAN_OF_ACTIVITIES":
      return `/forms/sf-004?${q}`;
    case "CERTIFICATION":
      return `/forms/sf-006?${q}`;
    default:
      return `/organizations/${orgId}/accreditation`;
  }
}
