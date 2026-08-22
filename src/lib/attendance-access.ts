import "server-only";
import { can } from "@/lib/auth/rbac";
import type { AuthUser } from "@/lib/auth/session";
import { isOfficerOf, type ParentRef } from "@/lib/attachment-access";

/**
 * Shared authorization for activity attendance, used by the server actions
 * and the attendance card. Reuses the attachment ParentRef shape.
 */

/** Attendance is taken around event time - not while paperwork is in flight. */
export function attendanceAllowedStatus(status: string): boolean {
  return ["APPROVED", "COMPLETED"].includes(status);
}

export function canManageAttendance(user: AuthUser, parent: ParentRef): boolean {
  if (user.isViewOnly) return false;
  if (can(user, "org.manage")) return true;
  return isOfficerOf(user.id, parent) && attendanceAllowedStatus(parent.status);
}

/**
 * A check-in window is open until an officer closes it, or until 24 hours
 * after the activity's scheduled end (configurable policy), whichever first.
 */
export function checkInWindowOpen(closedAt: Date | null, activityEndAt: Date): boolean {
  if (closedAt) return false;
  return Date.now() <= activityEndAt.getTime() + 24 * 60 * 60 * 1000;
}
