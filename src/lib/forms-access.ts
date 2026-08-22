import "server-only";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/rbac";
import type { AuthUser } from "@/lib/auth/session";

/**
 * Organizations the user may open official forms for:
 * admins see all, deans their college, advisers their assignments,
 * officers/members their memberships.
 */
export async function getAccessibleOrganizations(user: AuthUser) {
  const where = can(user, "org.manage")
    ? { status: "ACTIVE" as const }
    : user.role === "DEAN" && user.collegeId
      ? { status: "ACTIVE" as const, collegeId: user.collegeId }
      : {
          status: "ACTIVE" as const,
          OR: [
            { advisers: { some: { adviserId: user.id, isCurrent: true } } },
            { members: { some: { userId: user.id, isCurrent: true } } },
          ],
        };

  return db.organization.findMany({
    where,
    select: {
      id: true,
      name: true,
      acronym: true,
      college: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function hasMembership(userId: string, organizationId: string): Promise<boolean> {
  const m = await db.organizationMember.findFirst({
    where: { userId, organizationId, isCurrent: true },
    select: { id: true },
  });
  return Boolean(m);
}

export async function isAdviserOf(
  user: { id: string; role: string },
  organizationId: string
): Promise<boolean> {
  if (user.role !== "ADVISER_REGULAR" && user.role !== "ADVISER_PARTTIME") return false;
  const a = await db.adviserAssignment.findFirst({
    where: { adviserId: user.id, organizationId, isCurrent: true },
    select: { id: true },
  });
  return Boolean(a);
}

/** Officer = current PRESIDENT or SECRETARY of the organization. */
export async function isOfficerOf(userId: string, organizationId: string): Promise<boolean> {
  const m = await db.organizationMember.findFirst({
    where: {
      userId,
      organizationId,
      isCurrent: true,
      position: { in: ["PRESIDENT", "SECRETARY"] },
    },
    select: { id: true },
  });
  return Boolean(m);
}

/**
 * Access rule shared by the printable SF forms. `officersOnly` excludes plain
 * members (used for rosters and other documents containing personal data).
 */
export async function canUseOrgForm(
  user: AuthUser,
  org: { id: string; collegeId: string },
  opts?: { officersOnly?: boolean }
): Promise<boolean> {
  if (can(user, "org.manage")) return true;
  if (user.role === "DEAN" && user.collegeId === org.collegeId) return true;
  if (await isAdviserOf(user, org.id)) return true;
  if (opts?.officersOnly) return isOfficerOf(user.id, org.id);
  return hasMembership(user.id, org.id);
}
