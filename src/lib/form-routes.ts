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
  // Recognition application packet — no OSAS signature required.
  SF001: ["PRESIDENT", "SECRETARY", "SENIOR_ADVISER", "DEAN"],
  // Renewal request letter — routed up to OSAS for final approval.
  SF002: ["PRESIDENT", "SENIOR_ADVISER", "DEAN", "SOA", "OSAS"],
  // Adviser commitment — countersigned by the unit, not OSAS.
  SF003: ["PRESIDENT", "SECRETARY", "SENIOR_ADVISER", "DEAN"],
  // List of members — organization-side document.
  SF005: ["PRESIDENT", "SECRETARY", "SENIOR_ADVISER"],
};

export function formRoute(formKey: string): SignatoryRole[] {
  return FORM_ROUTES[formKey] ?? [];
}

/** Stable identity for one routing instance: per form, org, and AY. */
export function sfRouteEntityId(formKey: string, orgId: string, ay: string): string {
  return `${formKey}:${orgId}:${ay}`;
}
