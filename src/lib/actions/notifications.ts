"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";

// ---------------------------------------------------------------------------
// Notification actions (Part 9). Every write pins `userId` in the WHERE clause
// so a caller can never mutate or read another user's notifications (IDOR).
// ---------------------------------------------------------------------------

function refresh() {
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

/** Mark one notification read; ownership is enforced. */
export async function markNotificationRead(formData: FormData): Promise<void> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    await db.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  } catch {
    // Best-effort; never take the page down over a badge refresh.
  }
  refresh();
}

/** Mark all live notifications read, including Action Required backlog. */
export async function markAllNotificationsRead(): Promise<void> {
  try {
    const user = await requireUser();
    await db.notification.updateMany({
      where: { userId: user.id, readAt: null, archivedAt: null },
      data: { readAt: new Date() },
    });
  } catch {
    // Best-effort.
  }
  refresh();
}

/** Archive (move out of the center) one notification; ownership enforced. */
export async function archiveNotification(formData: FormData): Promise<void> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    await db.notification.updateMany({
      where: { id, userId: user.id },
      data: { archivedAt: new Date() },
    });
  } catch {
    // Best-effort.
  }
  refresh();
}

/** Open a notification: mark read, then hand the client the target link. */
export async function openNotification(formData: FormData): Promise<{ link?: string; error?: string }> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const row = await db.notification.findFirst({ where: { id, userId: user.id }, select: { link: true } });
    if (!row) return { error: "Notification not found." };
    if (row.link) {
      await db.notification.updateMany({
        where: { id, userId: user.id, readAt: null },
        data: { readAt: new Date() },
      });
      refresh();
      return { link: row.link };
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not open notification." };
  }
}

/** Toggle a preference category for the current user. */
export async function setNotificationPreference(input: {
  category: string;
  enabled: boolean;
}): Promise<{ error?: string }> {
  try {
    const user = await requireUser();
    const allowed = [
      "SIGNATURE",
      "REVIEW",
      "REVISION",
      "APPROVAL",
      "DEADLINE",
      "INTERVIEW",
      "SUBMISSION",
      "MEMBERSHIP",
      "ACTIVITY",
      "REPORT",
      "FINANCIAL",
      "FOLLOW_UP",
      "SYSTEM",
    ];
    const category = input.category;
    if (!allowed.includes(category)) return { error: "Unknown notification category." };
    await db.notificationPreference.upsert({
      where: { userId_category: { userId: user.id, category: category as never } },
      update: { enabled: input.enabled },
      create: { userId: user.id, category: category as never, enabled: input.enabled },
    });
    revalidatePath("/notifications/preferences");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update preference." };
  }
}