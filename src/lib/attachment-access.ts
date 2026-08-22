import { db } from "@/lib/db";
import { can, isAdminRole } from "@/lib/auth/rbac";
import type { AuthUser } from "@/lib/auth/session";

/**
 * Shared authorization for attachments, used by both the server actions and
 * the download route handler.
 */

export type ParentRef = {
  id: string;
  status: string;
  organizationId: string;
  organization: {
    collegeId: string | null;
    members: { userId: string; position: string }[];
  };
};

/** Loads the parent record of an attachment with the data needed for checks. */
export async function loadAttachableParent(
  entityType: string,
  entityId: string
): Promise<ParentRef | null> {
  const orgSelect = {
    select: {
      collegeId: true,
      members: {
        where: { isCurrent: true },
        select: { userId: true, position: true },
      },
    },
  };

  switch (entityType) {
    case "Recognition": {
      const rec = await db.recognition.findUnique({
        where: { id: entityId },
        select: { id: true, status: true, organizationId: true, organization: orgSelect },
      });
      return rec;
    }
    case "ActivityProposal": {
      const p = await db.activityProposal.findUnique({
        where: { id: entityId },
        select: { id: true, status: true, organizationId: true, organization: orgSelect },
      });
      return p;
    }
    case "AccomplishmentReport": {
      const r = await db.accomplishmentReport.findUnique({
        where: { id: entityId },
        select: { id: true, status: true, organizationId: true, organization: orgSelect },
      });
      return r;
    }
    default:
      return null;
  }
}

export function isOfficerOf(userId: string, parent: ParentRef): boolean {
  return parent.organization.members.some(
    (m) => m.userId === userId && (m.position === "PRESIDENT" || m.position === "SECRETARY")
  );
}

/** Statuses in which the owning organization may still modify the record. */
export function parentIsEditable(status: string): boolean {
  return ["DRAFT", "RETURNED"].includes(status);
}

/** May the user attach files to / remove their files from this record? */
export function canManageAttachments(user: AuthUser, parent: ParentRef): boolean {
  if (user.isViewOnly) return false;
  if (can(user, "org.manage")) return true;
  return isOfficerOf(user.id, parent) && parentIsEditable(parent.status);
}

/**
 * May the user view/download attachments of this record? Mirrors the detail
 * pages' scoping: admins campus-wide, deans within their college, others only
 * if connected to the organization (member or current adviser).
 */
export async function canViewAttachments(
  user: AuthUser,
  organizationId: string,
  organizationCollegeId: string | null
): Promise<boolean> {
  if (can(user, "org.manage")) return true;

  if (user.role === "DEAN") {
    return user.collegeId !== null && user.collegeId === organizationCollegeId;
  }

  if (user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME") {
    const assignment = await db.adviserAssignment.findFirst({
      where: { adviserId: user.id, organizationId, isCurrent: true },
    });
    if (assignment) return true;
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: user.id, organizationId, isCurrent: true },
  });
  return Boolean(membership);
}

/** Admins may delete any attachment; officers only their own, pre-decision. */
export function canDeleteAttachment(
  user: AuthUser,
  uploadedById: string,
  parent: ParentRef
): boolean {
  if (user.isViewOnly) return false;
  if (isAdminRole(user.role as never)) return true;
  return (
    uploadedById === user.id &&
    isOfficerOf(user.id, parent) &&
    parentIsEditable(parent.status)
  );
}
