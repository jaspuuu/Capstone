"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import {
  canManageAttendance,
  checkInWindowOpen,
} from "@/lib/attendance-access";
import type { AttendanceStatus } from "@/generated/prisma/client";

export type ActionState = { error?: string; success?: string };

const STATUSES: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];

async function loadActivity(id: string) {
  return db.activityProposal.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      startAt: true,
      endAt: true,
      academicYear: true,
      organizationId: true,
      organization: {
        select: {
          collegeId: true,
          members: { where: { isCurrent: true }, select: { userId: true, position: true } },
        },
      },
      checkIn: { select: { id: true, token: true, closedAt: true } },
    },
  });
}

/** Officer/admin opens (or reopens) the QR check-in window. */
export async function startCheckIn(formData: FormData): Promise<void> {
  const user = await requireUser();
  const activityId = String(formData.get("activityId") ?? "");

  const activity = await loadActivity(activityId);
  if (!activity) return;
  if (
    !canManageAttendance(user, {
      id: activity.id,
      status: activity.status,
      organizationId: activity.organizationId,
      organization: activity.organization,
    })
  ) {
    return;
  }

  // Reopening invalidates the old token so stale QR links stop working.
  const token = randomBytes(24).toString("hex");
  await db.activityCheckIn.upsert({
    where: { activityId },
    create: { activityId, token, createdById: user.id },
    update: { token, closedAt: null, createdById: user.id },
  });

  await writeAudit({
    userId: user.id,
    action: "CHECKIN_OPENED",
    entityType: "ActivityProposal",
    entityId: activityId,
    entityLabel: activity.title,
  });

  revalidatePath(`/activities/${activityId}`);
}

/** Officer/admin closes the window; existing records are kept. */
export async function endCheckIn(formData: FormData): Promise<void> {
  const user = await requireUser();
  const activityId = String(formData.get("activityId") ?? "");

  const activity = await loadActivity(activityId);
  if (!activity?.checkIn) return;
  if (
    !canManageAttendance(user, {
      id: activity.id,
      status: activity.status,
      organizationId: activity.organizationId,
      organization: activity.organization,
    })
  ) {
    return;
  }
  if (activity.checkIn.closedAt) return;

  await db.activityCheckIn.update({
    where: { activityId },
    data: { closedAt: new Date() },
  });

  await writeAudit({
    userId: user.id,
    action: "CHECKIN_CLOSED",
    entityType: "ActivityProposal",
    entityId: activityId,
    entityLabel: activity.title,
  });

  revalidatePath(`/activities/${activityId}`);
}

/** Officer/admin manually marks one member's attendance. */
export async function markAttendance(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireUser();
  const activityId = String(formData.get("activityId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const status = String(formData.get("status") ?? "");
  const remarks = String(formData.get("remarks") ?? "").trim().slice(0, 300);

  if (!STATUSES.includes(status as AttendanceStatus)) {
    return { error: "Choose a valid attendance status." };
  }

  const activity = await loadActivity(activityId);
  if (!activity) return { error: "The activity no longer exists." };
  if (
    !canManageAttendance(user, {
      id: activity.id,
      status: activity.status,
      organizationId: activity.organizationId,
      organization: activity.organization,
    })
  ) {
    return { error: "You cannot manage attendance for this activity." };
  }

  const isMember = activity.organization.members.some((m) => m.userId === memberId);
  if (!isMember) return { error: "That person is not a current member of the organization." };

  const existing = await db.activityAttendance.findUnique({
    where: { activityId_userId: { activityId, userId: memberId } },
  });

  await db.activityAttendance.upsert({
    where: { activityId_userId: { activityId, userId: memberId } },
    create: {
      activityId,
      userId: memberId,
      status: status as AttendanceStatus,
      source: "MANUAL",
      recordedById: user.id,
      remarks: remarks || null,
    },
    update: {
      status: status as AttendanceStatus,
      source: "MANUAL",
      recordedById: user.id,
      remarks: remarks || null,
    },
  });

  await writeAudit({
    userId: user.id,
    action: "ATTENDANCE_MARKED",
    entityType: "ActivityProposal",
    entityId: activityId,
    entityLabel: activity.title,
    previousState: existing
      ? { userId: memberId, status: existing.status, source: existing.source }
      : undefined,
    newState: { userId: memberId, status, source: "MANUAL", remarks: remarks || null },
  });

  revalidatePath(`/activities/${activityId}`);
  return { success: "Attendance saved." };
}

/**
 * Self check-in from a scanned QR code. The token proves physical presence
 * at the venue; membership and an open window are still enforced.
 */
export async function selfCheckIn(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireUser();
  const activityId = String(formData.get("activityId") ?? "");
  const token = String(formData.get("token") ?? "");

  const activity = await db.activityProposal.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      organizationId: true,
      organization: {
        select: { members: { where: { isCurrent: true }, select: { userId: true } } },
      },
      checkIn: { select: { token: true, closedAt: true } },
    },
  });
  if (!activity || !activity.checkIn) {
    return { error: "Check-in is not available for this activity." };
  }
  if (token !== activity.checkIn.token) {
    return { error: "This QR code is not valid for this activity." };
  }
  if (!checkInWindowOpen(activity.checkIn.closedAt, activity.endAt)) {
    return { error: "The check-in window has closed." };
  }
  const isMember = activity.organization.members.some((m) => m.userId === user.id);
  if (!isMember) {
    return { error: "Only current members of the organization can check in." };
  }

  const existing = await db.activityAttendance.findUnique({
    where: { activityId_userId: { activityId, userId: user.id } },
  });
  if (existing && existing.status === "PRESENT" && existing.source === "QR_CHECKIN") {
    return { success: "You were already checked in." };
  }

  // Arriving after the scheduled start counts as late (configurable policy).
  const late = Date.now() > activity.startAt.getTime();
  const status: AttendanceStatus = late ? "LATE" : "PRESENT";

  await db.activityAttendance.upsert({
    where: { activityId_userId: { activityId, userId: user.id } },
    create: {
      activityId,
      userId: user.id,
      status,
      source: "QR_CHECKIN",
      recordedById: user.id,
    },
    update: {
      status,
      source: "QR_CHECKIN",
      recordedById: user.id,
    },
  });

  await writeAudit({
    userId: user.id,
    action: "ATTENDANCE_CHECKIN",
    entityType: "ActivityProposal",
    entityId: activityId,
    entityLabel: activity.title,
    newState: { status, source: "QR_CHECKIN" },
  });

  revalidatePath(`/activities/${activityId}/checkin`);
  revalidatePath(`/activities/${activityId}`);
  return {
    success: late
      ? "Checked in - marked LATE (after the scheduled start)."
      : "Checked in - you are marked PRESENT.",
  };
}
