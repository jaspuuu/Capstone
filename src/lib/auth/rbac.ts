import type { Role } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/session";
import type { Prisma } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Permission catalogue. Roles are mapped to permissions in one place so the
// matrix stays configurable (§5, §11). Server actions independently enforce
// these checks - the UI merely reflects them.
// ---------------------------------------------------------------------------

export type Permission =
  | "org.view"
  | "org.manage"
  | "recognition.view"
  | "recognition.submit"
  | "renewal.submit"
  | "recognition.review"
  | "recognition.approve"
  | "deadline.view"
  | "deadline.manage"
  | "activity.submit"
  | "activity.approve"
  | "users.manage"
  | "college.manage"
  | "audit.view"
  | "analytics.view";

const ORG_OFFICER: Permission[] = [
  "org.view",
  "recognition.view",
  "recognition.submit",
  "renewal.submit",
  "activity.submit",
];

const ADVISER: Permission[] = ["org.view", "recognition.view"];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OSAS: [
    "org.view",
    "org.manage",
    "recognition.view",
    "recognition.submit",
    "renewal.submit",
    "recognition.review",
    "recognition.approve",
    "deadline.view",
    "deadline.manage",
    "activity.submit",
    "activity.approve",
    "users.manage",
    "college.manage",
    "audit.view",
    "analytics.view",
  ],
  // SOA mirrors most administrative capabilities but not user/college
  // administration or audit access; adjust here if OSAS delegates more.
  SOA: [
    "org.view",
    "org.manage",
    "recognition.view",
    "recognition.review",
    "recognition.approve",
    "deadline.view",
    "deadline.manage",
    "activity.submit",
    "activity.approve",
    "analytics.view",
  ],
  DEAN: [
    "org.view",
    "recognition.view",
    "recognition.review",
    "recognition.approve",
    "deadline.view",
    "activity.approve",
    "analytics.view",
  ],
  ADVISER_REGULAR: ADVISER,
  ADVISER_PARTTIME: ADVISER,
  PRESIDENT: ORG_OFFICER,
  SECRETARY: ORG_OFFICER,
  MEMBER: ["org.view", "recognition.view"],
};

export function can(user: Pick<AuthUser, "role">, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

export function canAny(user: Pick<AuthUser, "role">, permissions: Permission[]): boolean {
  return permissions.some((p) => can(user, p));
}

export function isAdminRole(role: Role): boolean {
  return role === "OSAS" || role === "SOA";
}

// ---------------------------------------------------------------------------
// Scoping. Every organization query for a non-admin must pass through this
// filter so users can never read outside their scope by editing URLs (§44).
// ---------------------------------------------------------------------------

export function orgScopeWhere(user: AuthUser): Prisma.OrganizationWhereInput {
  switch (user.role) {
    case "OSAS":
    case "SOA":
      return {};
    case "DEAN":
      return { collegeId: user.collegeId ?? "__none__" };
    case "ADVISER_REGULAR":
    case "ADVISER_PARTTIME":
      return {
        advisers: { some: { adviserId: user.id, isCurrent: true } },
      };
    default:
      return {
        members: { some: { userId: user.id, isCurrent: true } },
      };
  }
}

/** Combines an arbitrary filter with the user's scope. */
export function scopedOrgWhere(
  user: AuthUser,
  filter: Prisma.OrganizationWhereInput = {}
): Prisma.OrganizationWhereInput {
  return { AND: [orgScopeWhere(user), filter] };
}
