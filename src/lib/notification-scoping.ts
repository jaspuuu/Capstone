import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Fix #2 read-layer defense: relationship-scoped visibility.
//
// A notification with an `organizationId` + `academicYear` pair is only a
// "current task" (visible in the ACTION_REQUIRED tab) when the recipient
// holds a valid org relationship for THAT exact org and AY. Admin campus
// users (SOA/OSAS) bypass this filter. Deadlines without an org scope
// (campus-wide) are visible to everyone.
// ---------------------------------------------------------------------------

export type UserOrgRelation = { organizationId: string; academicYear: string };

/** Load every current org relationship this user has. */
export async function loadRelationInventory(userId: string): Promise<UserOrgRelation[]> {
  const [memberships, advisers] = await Promise.all([
    db.organizationMember.findMany({
      where: { userId, isCurrent: true, status: { in: ["ACTIVE", "APPROVED"] } },
      select: { organizationId: true, academicYear: true },
    }),
    db.adviserAssignment.findMany({
      where: { adviserId: userId, isCurrent: true },
      select: { organizationId: true, academicYear: true },
    }),
  ]);
  return [
    ...memberships.map((m) => ({ organizationId: m.organizationId, academicYear: m.academicYear })),
    ...advisers.map((a) => ({ organizationId: a.organizationId, academicYear: a.academicYear })),
  ];
}

/** True when the notification is either org-agnostic or matches a current relationship. */
export function isCurrentTaskFor(
  notification: { organizationId: string | null; academicYear: string | null },
  inventory: UserOrgRelation[]
): boolean {
  if (!notification.organizationId || !notification.academicYear) return true;
  return inventory.some(
    (r) => r.organizationId === notification.organizationId && r.academicYear === notification.academicYear
  );
}

/** Narrow a set of notifications to only those visible under the current relationship. */
export function filterCurrentTasks<T extends { organizationId: string | null; academicYear: string | null }>(
  rows: T[],
  inventory: UserOrgRelation[]
): T[] {
  return rows.filter((r) => isCurrentTaskFor(r, inventory));
}
