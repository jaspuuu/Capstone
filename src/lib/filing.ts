import { db } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { currentAcademicYear } from "@/lib/utils";

/**
 * Organizations the user may file paperwork for:
 * admins pick any active organization; officers pick their own current orgs.
 */
export async function filingOrganizations(user: AuthUser) {
  if (can(user, "org.manage")) {
    const orgs = await db.organization.findMany({
      where: { status: "ACTIVE", archivedAt: null },
      include: { college: { select: { code: true } } },
      orderBy: [{ college: { name: "asc" } }, { name: "asc" }],
    });
    return orgs.map((o) => ({
      id: o.id,
      label: `${o.name}${o.acronym ? ` (${o.acronym})` : ""} — ${o.college.code}`,
    }));
  }

  const orgs = await db.organization.findMany({
    where: {
      status: "ACTIVE",
      archivedAt: null,
      members: {
        some: {
          userId: user.id,
          isCurrent: true,
          position: { in: ["PRESIDENT", "SECRETARY"] },
          academicYear: currentAcademicYear(),
        },
      },
    },
    include: { college: { select: { code: true } } },
    orderBy: [{ college: { name: "asc" } }, { name: "asc" }],
  });
  return orgs.map((o) => ({
    id: o.id,
    label: `${o.name}${o.acronym ? ` (${o.acronym})` : ""} — ${o.college.code}`,
  }));
}
