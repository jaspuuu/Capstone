import type { MemberPosition, MembershipStatus } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Effective positions. Authority inside an organization always derives from
// the membership row (position + status + academic year) or the adviser
// assignment — never from the account role. These helpers centralize that
// classification so org pages cannot drift from the membership model.
// ---------------------------------------------------------------------------

const OFFICER_POSITIONS = new Set<MemberPosition>([
  "PRESIDENT",
  "VICE_PRESIDENT",
  "SECRETARY",
  "TREASURER",
  "AUDITOR",
  "PUBLIC_INFORMATION_OFFICER",
  "BUSINESS_MANAGER",
]);

/** True when the membership position is an officer position (not plain MEMBER/OTHER). */
export function isOfficerPosition(position: MemberPosition | null | undefined): boolean {
  return position != null && OFFICER_POSITIONS.has(position);
}

// Positions that govern an organization (submit/edit/manage members). This set
// intentionally mirrors the previous role-based PRESIDENT/SECRETARY authority
// so the switch to membership-derived checks does not widen or narrow it.
const GOVERNING_POSITIONS = new Set<MemberPosition>(["PRESIDENT", "SECRETARY"]);

export function canGovernOrganization(position: MemberPosition | null | undefined): boolean {
  return position != null && GOVERNING_POSITIONS.has(position);
}

/** Statuses that count as an effective (granting) membership for the AY. */
const EFFECTIVE_MEMBERSHIP_STATUSES = new Set<MembershipStatus>(["ACTIVE", "APPROVED"]);

export function hasEffectiveMembership(status: MembershipStatus | null | undefined): boolean {
  return status != null && EFFECTIVE_MEMBERSHIP_STATUSES.has(status);
}