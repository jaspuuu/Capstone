import { db } from "@/lib/db";
import type { MemberPosition, MembershipStatus } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// §24 student-officer exclusivity: a student may hold an officer position
// (including org-specific "OTHER" seats) in ONLY ONE organization during the
// same academic year. Regular members may belong to several organizations at
// once as long as they do not hold an active officer seat elsewhere. The rule
// is strictly per academic year — past or future AYs never count.
// ---------------------------------------------------------------------------

/** Every position whose holder counts as an "officer" for exclusivity. */
export const EXCLUSIVE_OFFICER_POSITIONS = new Set<MemberPosition>([
  "PRESIDENT",
  "VICE_PRESIDENT",
  "SECRETARY",
  "TREASURER",
  "AUDITOR",
  "PUBLIC_INFORMATION_OFFICER",
  "BUSINESS_MANAGER",
  "OTHER",
]);

export function isExclusiveOfficerPosition(position: MemberPosition | null | undefined): boolean {
  return position != null && EXCLUSIVE_OFFICER_POSITIONS.has(position);
}

/** Membership statuses that make a seat effective (granting) for a year. */
const EFFECTIVE_STATUSES = new Set<MembershipStatus>(["ACTIVE", "APPROVED"]);

export function isEffectiveMembershipStatus(status: MembershipStatus | null | undefined): boolean {
  return status != null && EFFECTIVE_STATUSES.has(status);
}

export interface ElsewhereSeat {
  organizationId: string;
  organizationName: string;
  position: MemberPosition;
}

/**
 * The student's effective seat in a DIFFERENT organization for the same
 * academic year, or null. An officer seat elsewhere blocks a new regular
 * membership; a regular seat elsewhere is allowed under the same AY.
 */
export async function officerAssignmentElsewhere(
  userId: string,
  organizationId: string,
  academicYear: string
): Promise<ElsewhereSeat | null> {
  const row = await db.organizationMember.findFirst({
    where: {
      userId,
      academicYear,
      organizationId: { not: organizationId },
      isCurrent: true,
      status: { in: [...EFFECTIVE_STATUSES] },
      position: { in: [...EXCLUSIVE_OFFICER_POSITIONS] },
    },
    include: { organization: { select: { name: true } } },
  });
  if (!row) return null;
  return {
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    position: row.position,
  };
}

/**
 * Any effective membership (officer or regular) the student holds in a
 * DIFFERENT organization for the same academic year. Granting an officer seat
 * is blocked whenever this is non-null.
 */
export async function activeMembershipsElsewhere(
  userId: string,
  organizationId: string,
  academicYear: string
): Promise<ElsewhereSeat | null> {
  const row = await db.organizationMember.findFirst({
    where: {
      userId,
      academicYear,
      organizationId: { not: organizationId },
      isCurrent: true,
      status: { in: [...EFFECTIVE_STATUSES] },
    },
    include: { organization: { select: { name: true } } },
  });
  if (!row) return null;
  return {
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    position: row.position,
  };
}

/**
 * User-facing conflict message when a student cannot take a seat because of
 * the AY's exclusivity rule. `targetPosition` distinguishes the officer case
 * (any seat elsewhere blocks) from the regular case (officer seat elsewhere
 * blocks).
 */
export function exclusivityMessage(
  studentName: string,
  seat: ElsewhereSeat,
  targetPosition: MemberPosition
): string {
  if (isExclusiveOfficerPosition(targetPosition)) {
    return `${studentName} already holds a position with ${seat.organizationName} for this academic year. A student officer can only serve in one organization per year — end that seat first.`;
  }
  return `${studentName} is a student officer of ${seat.organizationName} for this academic year. A student officer can only serve in one organization per year, so they cannot register as a member elsewhere.`;
}