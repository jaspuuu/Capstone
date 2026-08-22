import "server-only";
import { db } from "@/lib/db";

/**
 * Part 9 - Automated deadline notifications & alert system (proposal
 * objective 1.3). In-app only by design: no SMTP infrastructure exists on
 * the target deployment; email delivery is a documented future extension.
 *
 * Every function here is best-effort: notification failures must never
 * break the primary workflow action that triggered them.
 */

export type NotificationPayload = {
  type: string;
  title: string;
  body?: string;
  link?: string;
};

export async function notifyUsers(userIds: string[], payload: NotificationPayload): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  try {
    await db.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body ?? null,
        link: payload.link ?? null,
      })),
    });
  } catch {
    // Swallow — never block the triggering action.
  }
}

/** Notify an organization's current president and secretary. */
export async function notifyOrgOfficers(organizationId: string, payload: NotificationPayload): Promise<void> {
  try {
    const members = await db.organizationMember.findMany({
      where: {
        organizationId,
        isCurrent: true,
        position: { in: ["PRESIDENT", "SECRETARY"] },
      },
      select: { userId: true },
    });
    await notifyUsers(members.map((m) => m.userId), payload);
  } catch {
    // Best-effort.
  }
}

/** Notify an organization's current advisers. */
export async function notifyOrgAdvisers(organizationId: string, payload: NotificationPayload): Promise<void> {
  try {
    const assignments = await db.adviserAssignment.findMany({
      where: { organizationId, isCurrent: true },
      select: { adviserId: true },
    });
    await notifyUsers(assignments.map((a) => a.adviserId), payload);
  } catch {
    // Best-effort.
  }
}

export async function notifyOrgOfficersAndAdvisers(
  organizationId: string,
  payload: NotificationPayload
): Promise<void> {
  await notifyOrgOfficers(organizationId, payload);
  await notifyOrgAdvisers(organizationId, payload);
}

// ---------------------------------------------------------------------------
// Deadline audience resolution
// ---------------------------------------------------------------------------

type DeadlineScopeInfo = {
  scopeType: "ALL" | "MOTHER" | "CHILD" | "INDEPENDENT";
  scopeCollegeId: string | null;
};

/** Active organizations covered by a deadline's scope. */
export async function organizationsForDeadline(d: DeadlineScopeInfo): Promise<string[]> {
  const orgs = await db.organization.findMany({
    where: {
      status: "ACTIVE",
      ...(d.scopeCollegeId ? { collegeId: d.scopeCollegeId } : {}),
      ...(d.scopeType !== "ALL" ? { type: d.scopeType } : {}),
    },
    select: { id: true },
  });
  return orgs.map((o) => o.id);
}

/** Distinct officers + advisers across many orgs, batched. */
export async function officerAndAdviserIdsForOrgs(orgIds: string[]): Promise<string[]> {
  if (orgIds.length === 0) return [];
  const [members, advisers] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: { in: orgIds }, isCurrent: true, position: { in: ["PRESIDENT", "SECRETARY"] } },
      select: { userId: true },
    }),
    db.adviserAssignment.findMany({
      where: { organizationId: { in: orgIds }, isCurrent: true },
      select: { adviserId: true },
    }),
  ]);
  return [...new Set([...members.map((m) => m.userId), ...advisers.map((a) => a.adviserId)])];
}
