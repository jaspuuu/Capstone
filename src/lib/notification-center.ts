import { db } from "@/lib/db";
import { organizationsForDeadline, notifyUsers } from "@/lib/notifications";
import { filterCurrentTasks, loadRelationInventory } from "@/lib/notification-scoping";
import type { NotificationCategory, NotificationPriority } from "@/generated/prisma/client";

/**
 * Notification center (Part 9).
 *
 * The bell popover and the /notifications page both load from this module.
 * The bell answers "what changed?" (Action Required / Attention / Updates,
 * newest first) — it is NOT the same as the dashboard work queue ("what must
 * I do now?").
 *
 * Reading rules enforced here:
 * - Archived rows never appear.
 * - Expired rows never appear (maintenance may archive them later; reads just
 *   treat them as absent).
 * - readAt is promoted lazily when a user opens a row / marks all read.
 */

export type CenterRow = {
  id: string;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string | null;
  link: string | null;
  reason: string | null;
  orgName: string | null;
  orgAcronym: string | null;
  groupCount: number;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationCenter = {
  unread: number;
  actionRequired: CenterRow[];
  updates: CenterRow[];
  recentRead: CenterRow[];
};

type QueryRow = {
  id: string;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string | null;
  link: string | null;
  reason: string | null;
  groupCount: number;
  readAt: Date | null;
  createdAt: Date;
  organizationId: string | null;
  academicYear: string | null;
  organization: { name: string; acronym: string | null } | null;
};

function liveWhere(extra?: object) {
  return {
    archivedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    ...extra,
  };
}

function toRows(rows: QueryRow[]): CenterRow[] {
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    category: r.category,
    priority: r.priority,
    title: r.title,
    body: r.body,
    link: r.link,
    reason: r.reason,
    orgName: r.organization?.name ?? null,
    orgAcronym: r.organization?.acronym ?? null,
    groupCount: r.groupCount,
    readAt: r.readAt,
    createdAt: r.createdAt,
  }));
}

/** Campus-wide administration bypasses relationship scoping. */
async function isCampusAdmin(userId: string): Promise<boolean> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === "SOA" || u?.role === "OSAS";
}

export async function getNotificationCenter(userId: string): Promise<NotificationCenter> {
  await ensureActiveDeadlineReminders(userId).catch(() => {});

  const [pendingRaw, updates, recentRead, unreadTotal] = await Promise.all([
    db.notification.findMany({
      where: liveWhere({ userId, priority: "ACTION_REQUIRED", readAt: null }),
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { organization: { select: { name: true, acronym: true } } },
    }),
    db.notification.findMany({
      where: liveWhere({ userId, priority: { not: "ACTION_REQUIRED" } }),
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { organization: { select: { name: true, acronym: true } } },
    }),
    db.notification.findMany({
      where: liveWhere({ userId, readAt: { not: null } }),
      orderBy: { readAt: "desc" },
      take: 5,
      include: { organization: { select: { name: true, acronym: true } } },
    }),
    db.notification.count({ where: liveWhere({ userId, readAt: null }) }),
  ]);

  // Fix #2: "Action required" only surfaces tasks the recipient actually holds
  // a current org relationship for (this AY). Campus admins see everything.
  let pending: typeof pendingRaw = pendingRaw;
  if (!(await isCampusAdmin(userId))) {
    const inventory = await loadRelationInventory(userId);
    pending = filterCurrentTasks(pendingRaw, inventory);
  }

  return { unread: unreadTotal, actionRequired: toRows(pending), updates: toRows(updates), recentRead: toRows(recentRead) };
}

/** Unread count for the bell badge (cheap single query). */
export async function getUnreadCount(userId: string): Promise<number> {
  await ensureActiveDeadlineReminders(userId).catch(() => {});
  return db.notification.count({ where: liveWhere({ userId, readAt: null }) });
}

/**
 * All live notifications for the full page feed. When `scoped` is true the
 * ACTION_REQUIRED rows are narrowed to current org relationships (Fix #2).
 */
export async function getNotificationFeed(
  userId: string,
  opts: { scoped?: boolean } = {}
): Promise<CenterRow[]> {
  await ensureActiveDeadlineReminders(userId).catch(() => {});
  const rows = await db.notification.findMany({
    where: liveWhere({ userId }),
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { organization: { select: { name: true, acronym: true } } },
  });
  if (opts.scoped && !(await isCampusAdmin(userId))) {
    const inventory = await loadRelationInventory(userId);
    return toRows(filterCurrentTasks(rows, inventory));
  }
  return toRows(rows);
}

export type NotificationStats = {
  total: number;
  unread: number;
  actionRequired: number;
  byCategory: { category: NotificationCategory; count: number }[];
  byPriority: { priority: NotificationPriority; count: number }[];
};

export async function getNotificationStats(userId: string): Promise<NotificationStats> {
  await ensureActiveDeadlineReminders(userId).catch(() => {});
  const where = { userId, ...liveWhere() };
  const [total, unread, actionRequired, byCategory, byPriority] = await Promise.all([
    db.notification.count({ where }),
    db.notification.count({ where: { ...where, readAt: null } }),
    db.notification.count({ where: { ...where, priority: "ACTION_REQUIRED", readAt: null } }),
    db.notification.groupBy({ by: ["category"], where, _count: true }),
    db.notification.groupBy({ by: ["priority"], where, _count: true }),
  ]);
  return {
    total,
    unread,
    actionRequired,
    byCategory: byCategory.map((g) => ({ category: g.category, count: g._count })),
    byPriority: byPriority.map((g) => ({ priority: g.priority, count: g._count })),
  };
}

// ---------------------------------------------------------------------------
// Deadline reminders (lazy, idempotent)
//
// Runs on every bell/page load. Each deadline × recipient × bucket has a
// unique `dedupKey`, so a reminder can never be duplicated no matter how many
// times the pass runs. Buckets: 14d / 7d / 3d / tomorrow / today / overdue.
// ---------------------------------------------------------------------------

export async function ensureActiveDeadlineReminders(userId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user?.role) return;
  const isCampus = user.role === "SOA" || user.role === "OSAS";

  const [deadlines, memberships, adviserOf] = await Promise.all([
    db.deadline.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        process: true,
        academicYear: true,
        startDate: true,
        dueDate: true,
        scopeType: true,
        scopeCollegeId: true,
        instructions: true,
      },
    }),
    db.organizationMember.findMany({ where: { userId, isCurrent: true }, select: { organizationId: true } }),
    db.adviserAssignment.findMany({ where: { adviserId: userId, isCurrent: true }, select: { organizationId: true } }),
  ]);

  const myOrgIds = new Set([...memberships.map((m) => m.organizationId), ...adviserOf.map((a) => a.organizationId)]);
  if (deadlines.length === 0) return;

  const now = Date.now();

  for (const d of deadlines) {
    const start = d.startDate.getTime();
    const due = d.dueDate.getTime();
    if (now < start) continue;

    const daysLeft = (due - now) / 86_400_000;
    let bucket: string | null = null;
    let bucketKind: "critical" | "headsUp" = "headsUp";
    if (now > due) {
      bucket = "Overdue";
      bucketKind = "critical";
    } else if (daysLeft <= 0.5) {
      bucket = "Due today";
      bucketKind = "critical";
    } else if (daysLeft <= 1.5) bucket = "Due tomorrow";
    else if (daysLeft <= 3.5) bucket = "Due in 3 days";
    else if (daysLeft <= 7.5) bucket = "Due in 7 days";
    else if (daysLeft <= 14.5) bucket = "Due in 14 days";
    if (!bucket) continue;

    // Scope: only deadlines covering an org this user leads/advises (campus
    // administration sees every active deadline).
    if (!isCampus) {
      const covered = await organizationsForDeadline({ scopeType: d.scopeType, scopeCollegeId: d.scopeCollegeId });
      if (!covered.some((o) => myOrgIds.has(o))) continue;
    }

    const dueLabel = d.dueDate.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
    await notifyUsers([userId], {
      type: "DEADLINE_REMINDER",
      category: "DEADLINE",
      priority: bucketKind === "critical" ? "ACTION_REQUIRED" : "ATTENTION",
      title: `${bucket}: ${d.name}`,
      body: `Due ${dueLabel}${d.instructions ? ` — ${d.instructions.slice(0, 160)}` : ""}`,
      link: "/deadlines",
      entityType: "Deadline",
      entityId: d.id,
      academicYear: d.academicYear,
      reason:
        bucketKind === "critical"
          ? `This ${d.process.toLowerCase()} deadline for AY ${d.academicYear} has arrived — complete it before it is marked missed.`
          : `This ${d.process.toLowerCase()} deadline for AY ${d.academicYear} applies to an organization you lead or advise.`,
      dedupKey: `DEADLINE_REMINDER:${d.id}:${bucket}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Preference accessors
// ---------------------------------------------------------------------------

export async function getNotificationPreferences(userId: string): Promise<Record<NotificationCategory, boolean>> {
  const rows = await db.notificationPreference.findMany({ where: { userId } });
  const map = new Map(rows.map((r) => [r.category, r.enabled]));
  const defaults: Record<NotificationCategory, boolean> = {
    SIGNATURE: true,
    REVIEW: true,
    REVISION: true,
    APPROVAL: true,
    DEADLINE: true,
    INTERVIEW: true,
    SUBMISSION: true,
    MEMBERSHIP: true,
    ACTIVITY: true,
    REPORT: true,
    FINANCIAL: true,
    FOLLOW_UP: true,
    SYSTEM: true,
  };
  for (const k of Object.keys(defaults) as NotificationCategory[]) {
    const v = map.get(k);
    if (v !== undefined) defaults[k] = v;
  }
  return defaults;
}