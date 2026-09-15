import { db } from "@/lib/db";
import { resolveOrgContext, resolveSigners } from "@/lib/signature-policy";
import type { NotificationCategory, NotificationPriority, SignatoryRole } from "@/generated/prisma/client";

/**
 * Workflow-assistant notifications (Part 9).
 * Every notification answers three questions: What happened? Why does it
 * matter to me? What should I do? Priority carries the "do" part; category
 * carries the preference toggle; organizationId + entityType/entityId carry
 * the authorization scope (reads/actions are always verified server-side);
 * academicYear pins the org relationship a recipient needs — Fix #2 read-layer
 * scoping uses it to keep current tasks tied to this AY's relationships.
 *
 * Rules enforced here:
 * - Preference gating: a category the user disabled is suppressed UNLESS the
 *   notification is ACTION_REQUIRED — mandatory workflow steps (signature,
 *   review, overdue) can never be muted. The disable is category-aware: muting
 *   one category never mutes another.
 * - Recipient scoping: org officers/advisers/members are resolved from
 *   relationship rows (position + status + academicYear + isCurrent), never
 *   from the account role column.
 * - Grouping: rows sharing a `groupKey` for a recipient fold into one row
 *   (counted) instead of spamming N notifications for one event.
 * - Idempotency: `dedupKey` rows upsert, so lazy passes (deadline reminders)
 *   can never create duplicates.
 * - Expiry: every row gets a lifetime so old items never dominate the center.
 * - Best-effort: notification failures never block the triggering action.
 */

export const MANDATORY_PRIORITIES: readonly NotificationPriority[] = ["ACTION_REQUIRED"];

export type NotificationInput = {
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body?: string | null;
  link?: string | null;
  organizationId?: string | null;
  /** Academic year the notification's org relationship applies to. */
  academicYear?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** "Why am I seeing this?" explanation (rendered on detail rows). */
  reason?: string | null;
  /** Stable key shared by related events for a recipient -> grouped row. */
  groupKey?: string | null;
  /** Unique idempotency key (embedded userId is added automatically). */
  dedupKey?: string | null;
  expiresAt?: Date | null;
};

/** Default lifetime so old notifications age out instead of dominating. */
function defaultLifetime(priority: NotificationPriority) {
  switch (priority) {
    case "ACTION_REQUIRED":
      return 30 * 86_400_000;
    case "ATTENTION":
      return 21 * 86_400_000;
    default:
      return 14 * 86_400_000;
  }
}

/**
 * Category-aware preference gating. A user opts out of ONE category; that
 * never mutes another. Mandatory (ACTION_REQUIRED) rows always pass.
 */
async function enabledUserIds(
  userIds: string[],
  priority: NotificationPriority,
  category: NotificationCategory
): Promise<Map<string, boolean>> {
  if (priority === "ACTION_REQUIRED") return new Map(userIds.map((id) => [id, true]));
  const prefs = await db.notificationPreference.findMany({
    where: { userId: { in: userIds }, category, enabled: false },
    select: { userId: true },
  });
  const disabled = new Set(prefs.map((p) => p.userId));
  const map = new Map<string, boolean>();
  for (const id of userIds) map.set(id, !disabled.has(id));
  return map;
}

function rowFields(userId: string, kind: NotificationInput, expiresAt: Date) {
  return {
    userId,
    type: kind.type,
    category: kind.category,
    priority: kind.priority,
    title: kind.title,
    body: kind.body ?? null,
    link: kind.link ?? null,
    organizationId: kind.organizationId ?? null,
    academicYear: kind.academicYear ?? null,
    entityType: kind.entityType ?? null,
    entityId: kind.entityId ?? null,
    reason: kind.reason ?? null,
    groupKey: kind.groupKey ?? null,
    dedupKey: kind.dedupKey ? `${userId}:${kind.dedupKey}` : null,
    expiresAt,
  };
}

export async function notifyUsers(userIds: string[], kind: NotificationInput): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  try {
    const expiresAt = kind.expiresAt ?? new Date(Date.now() + defaultLifetime(kind.priority));
    const allowed = await enabledUserIds(unique, kind.priority, kind.category);
    const recipients = unique.filter((id) => allowed.get(id) !== false);
    if (recipients.length === 0) return;

    // Grouped sends fold related events into one row per recipient.
    if (kind.groupKey) {
      for (const userId of recipients) {
        const existing = await db.notification.findFirst({
          where: { userId, groupKey: kind.groupKey, archivedAt: null },
          orderBy: { createdAt: "desc" },
        });
        const fields = rowFields(userId, kind, expiresAt);
        if (existing) {
          await db.notification.update({
            where: { id: existing.id },
            data: {
              title: kind.title,
              body: kind.body ?? existing.body,
              link: kind.link ?? existing.link,
              reason: kind.reason ?? existing.reason,
              expiresAt,
              groupCount: existing.groupCount + 1,
            },
          });
        } else {
          await db.notification.create({ data: { ...fields, groupCount: 1 } });
        }
      }
      return;
    }

    // Idempotent upserts (deadline reminders and one-shot sends with dedupKey).
    const withDedup = recipients.filter(() => kind.dedupKey);
    const withoutDedup = recipients.filter(() => !kind.dedupKey);
    if (withDedup.length > 0) {
      for (const userId of withDedup) {
        const fields = rowFields(userId, kind, expiresAt);
        await db.notification.upsert({
          where: { dedupKey: fields.dedupKey! },
          update: {
            title: kind.title,
            body: kind.body ?? null,
            link: kind.link ?? null,
            reason: kind.reason ?? null,
            organizationId: fields.organizationId,
            academicYear: fields.academicYear,
            entityType: fields.entityType,
            entityId: fields.entityId,
            expiresAt,
          },
          create: { ...fields, groupCount: 1 },
        });
      }
    }
    if (withoutDedup.length > 0) {
      await db.notification.createMany({
        data: withoutDedup.map((userId) => ({ ...rowFields(userId, kind, expiresAt), groupCount: 1 })),
      });
    }
  } catch {
    // Swallow — never block the triggering action.
  }
}

export type OrgAudienceOptions = { academicYear?: string | null };

/** Effective org relations of a given kind, scoped by (optional) academic year. */
async function orgOfficerIds(
  organizationId: string,
  opts: OrgAudienceOptions
): Promise<string[]> {
  const rows = await db.organizationMember.findMany({
    where: {
      organizationId,
      isCurrent: true,
      position: { in: ["PRESIDENT", "SECRETARY"] },
      status: { in: ["ACTIVE", "APPROVED"] },
      ...(opts.academicYear ? { academicYear: opts.academicYear } : {}),
    },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/** Notify an organization's current governing officers (President/Secretary). */
export async function notifyOrgOfficers(
  organizationId: string,
  kind: NotificationInput,
  opts: OrgAudienceOptions = {}
): Promise<void> {
  try {
    const ay = opts.academicYear ?? kind.academicYear ?? null;
    const ids = await orgOfficerIds(organizationId, { academicYear: ay });
    await notifyUsers(ids, { ...kind, organizationId: kind.organizationId ?? organizationId, academicYear: kind.academicYear ?? ay });
  } catch {
    // Best-effort.
  }
}

/** Notify an organization's current advisers. */
export async function notifyOrgAdvisers(
  organizationId: string,
  kind: NotificationInput,
  opts: OrgAudienceOptions = {}
): Promise<void> {
  try {
    const ay = opts.academicYear ?? kind.academicYear ?? null;
    const assignments = await db.adviserAssignment.findMany({
      where: {
        organizationId,
        isCurrent: true,
        ...(ay ? { academicYear: ay } : {}),
      },
      select: { adviserId: true },
    });
    await notifyUsers(
      assignments.map((a) => a.adviserId),
      { ...kind, organizationId: kind.organizationId ?? organizationId, academicYear: kind.academicYear ?? ay }
    );
  } catch {
    // Best-effort.
  }
}

export async function notifyOrgOfficersAndAdvisers(
  organizationId: string,
  kind: NotificationInput,
  opts: OrgAudienceOptions = {}
): Promise<void> {
  await notifyOrgOfficers(organizationId, kind, opts);
  await notifyOrgAdvisers(organizationId, kind, opts);
}

/**
 * Notify regular members (MEMBER seats) of an organization — the member-permitted
 * audience for activities, announcements, and membership outcomes.
 */
export async function notifyActiveMembers(
  organizationId: string,
  kind: NotificationInput,
  opts: OrgAudienceOptions = {}
): Promise<void> {
  try {
    const ay = opts.academicYear ?? kind.academicYear ?? null;
    const rows = await db.organizationMember.findMany({
      where: {
        organizationId,
        isCurrent: true,
        position: "MEMBER",
        status: { in: ["ACTIVE", "APPROVED"] },
        ...(ay ? { academicYear: ay } : {}),
      },
      select: { userId: true },
    });
    await notifyUsers(
      rows.map((r) => r.userId),
      { ...kind, organizationId: kind.organizationId ?? organizationId, academicYear: kind.academicYear ?? ay }
    );
  } catch {
    // Best-effort.
  }
}

/** Notify the signer(s) of the CURRENT step of a signature route. Signatories
 * are resolved from the routed record's organization relationships via
 * signature-policy (Fix #2) — never from the account role column. */
export async function notifyRouteSigners(routeId: string, kind: NotificationInput): Promise<void> {
  try {
    const current = await db.signatureStep.findFirst({
      where: { routeId, status: "CURRENT" },
      select: { role: true },
    });
    if (!current) return;
    const route = await db.signatureRoute.findUnique({
      where: { id: routeId },
      select: { entityType: true, entityId: true },
    });
    if (!route) return;
    const org = await resolveOrgContext(route.entityType, route.entityId);
    const signers = await resolveSigners(current.role as SignatoryRole, org);
    if (signers.length === 0) return;
    await notifyUsers(
      signers,
      {
        ...kind,
        organizationId: kind.organizationId ?? org.id,
        academicYear: kind.academicYear ?? org.academicYear,
        entityType: kind.entityType ?? route.entityType,
        entityId: kind.entityId ?? route.entityId,
      }
    );
  } catch {
    // Best-effort.
  }
}

/** All roles that hold the office/administration of a campus process. */
export async function officiatingUserIds(roles: string[]): Promise<string[]> {
  if (roles.length === 0) return [];
  try {
    const users = await db.user.findMany({
      where: { role: { in: roles as never }, isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  } catch {
    return [];
  }
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
      where: {
        organizationId: { in: orgIds },
        isCurrent: true,
        position: { in: ["PRESIDENT", "SECRETARY"] },
        status: { in: ["ACTIVE", "APPROVED"] },
      },
      select: { userId: true, academicYear: true },
    }),
    db.adviserAssignment.findMany({
      where: { organizationId: { in: orgIds }, isCurrent: true },
      select: { adviserId: true, academicYear: true },
    }),
  ]);
  return [...new Set([...members.map((m) => m.userId), ...advisers.map((a) => a.adviserId)])];
}