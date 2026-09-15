/**
 * Attachment kind types and guards — pure data, no Node.js imports.
 * Safe to import from client components.
 */

export const ATTACHMENT_KINDS = [
  "CONSTITUTION",
  "PLAN_OF_ACTIVITIES",
  "ACCOMPLISHMENT_REPORTS",
  "ADVISER_COMMITMENT",
  "CERTIFICATION",
  "FINANCIAL_REPORT",
  "SUPPORTING_DOCUMENTS",
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  CONSTITUTION: "Constitution and By-Laws",
  PLAN_OF_ACTIVITIES: "Plan of Activities",
  ACCOMPLISHMENT_REPORTS: "Accomplishment Reports",
  ADVISER_COMMITMENT: "Adviser's Commitment Form",
  CERTIFICATION: "Dean's Certification",
  FINANCIAL_REPORT: "Financial Report",
  SUPPORTING_DOCUMENTS: "Supporting Documents",
};

export function isAttachmentKind(value: string): value is AttachmentKind {
  return (ATTACHMENT_KINDS as readonly string[]).includes(value);
}
