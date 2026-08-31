"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";

export type ActionState = { error?: string; success?: string };

type OrgForScope = {
  collegeId: string;
  members: { userId: string; position: string }[];
  advisers: { adviserId: string }[];
};

/** Officers, the org's current adviser(s), the college dean, and admins may record M&E. */
async function canRecordMonitoring(user: AuthUser, org: OrgForScope): Promise<boolean> {
  if (can(user, "org.manage")) return true;
  if (user.role === "DEAN" && org.collegeId === user.collegeId) return true;
  const officer = org.members.some(
    (m) => m.userId === user.id && (m.position === "PRESIDENT" || m.position === "SECRETARY")
  );
  if (officer) return true;
  return org.advisers.some((a) => a.adviserId === user.id);
}

const monitoringSchema = z
  .object({
    activityId: z.string().min(1),
    status: z.enum(["IMPLEMENTED", "NOT_IMPLEMENTED", "RESCHEDULED"]),
    reason: z.string().trim().max(1000).optional().or(z.literal("")),
    rescheduledTo: z.string().optional().or(z.literal("")),
    responsibleNote: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((d, ctx) => {
    if (d.status !== "IMPLEMENTED") {
      if (!d.reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            d.status === "RESCHEDULED"
              ? "Give the reason for rescheduling."
              : "Give the reason the activity was not implemented.",
          path: ["reason"],
        });
      }
    }
    if (d.status === "RESCHEDULED") {
      const next = new Date(`${d.rescheduledTo}T00:00:00`);
      if (!d.rescheduledTo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select the new target date for the rescheduled activity.",
          path: ["rescheduledTo"],
        });
      } else if (Number.isNaN(next.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The new target date is invalid.",
          path: ["rescheduledTo"],
        });
      } else if (next.getTime() <= new Date().setHours(0, 0, 0, 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The rescheduled target date must be in the future.",
          path: ["rescheduledTo"],
        });
      }
    }
  });

export async function saveMonitoring(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireUser();
  if (user.isViewOnly) return { error: "Your account has view-only access." };

  const parsed = monitoringSchema.safeParse({
    activityId: formData.get("activityId"),
    status: formData.get("status"),
    reason: formData.get("reason") || "",
    rescheduledTo: formData.get("rescheduledTo") || "",
    responsibleNote: formData.get("responsibleNote") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  // Selected responsible people (user ids) — validated against the org roster
  // below so a tampered form cannot reference strangers.
  const responsibleMemberIds = formData
    .getAll("responsibleMemberIds")
    .map((v) => String(v))
    .filter((v) => v.length > 0);

  const proposal = await db.activityProposal.findUnique({
    where: { id: d.activityId },
    include: {
      organization: {
        select: {
          collegeId: true,
          name: true,
          members: { where: { isCurrent: true }, select: { userId: true, position: true } },
          advisers: { where: { isCurrent: true }, select: { adviserId: true } },
        },
      },
      monitoring: true,
    },
  });
  if (!proposal || proposal.status !== "APPROVED") {
    return { error: "Only approved activities can have a monitoring outcome." };
  }
  const org = proposal.organization;
  if (!(await canRecordMonitoring(user, org))) {
    return { error: "You do not have permission to record monitoring for this organization." };
  }

  let memberIdSet = new Set<string>();
  if (responsibleMemberIds.length > 0) {
    const allowed = new Set<string>([
      ...org.members.map((m) => m.userId),
      ...org.advisers.map((a) => a.adviserId),
    ]);
    memberIdSet = new Set(responsibleMemberIds.filter((id) => allowed.has(id)));
  }

  // Reschedule history: never overwrite the original startAt; append a
  // {from, to, reason, at} record referencing the previous target date.
  const previous = proposal.monitoring;
  const original = proposal.startAt;
  const previousTarget =
    previous?.rescheduledTo && previous.rescheduledTo.getTime() !== original.getTime()
      ? previous.rescheduledTo
      : original;
  const history: { from: string; to?: string; reason?: string; by?: string; at: string }[] = Array.isArray(
    previous?.rescheduleHistory
  )
    ? (previous.rescheduleHistory as { from: string; to?: string; reason?: string; by?: string; at: string }[])
    : [];

  const lastReschedule =
    history.length > 0 && history[history.length - 1].to
      ? new Date(history[history.length - 1].to!)
      : previousTarget;
  if (d.status === "RESCHEDULED" && d.rescheduledTo) {
    const next = new Date(`${d.rescheduledTo}T00:00:00`);
    if (!lastReschedule || next.getTime() !== lastReschedule.getTime()) {
      history.push({
        from: previousTarget.toISOString(),
        to: next.toISOString(),
        reason: d.reason || undefined,
        by: user.id,
        at: new Date().toISOString(),
      });
    }
  }

  const historyValue = history.length > 0 ? history : Prisma.DbNull;

  try {
    await db.activityMonitoring.upsert({
      where: { activityId: d.activityId },
      update: {
        status: d.status,
        reason: d.reason || null,
        rescheduledTo:
          d.status === "RESCHEDULED" && d.rescheduledTo
            ? new Date(`${d.rescheduledTo}T00:00:00`)
            : previous?.rescheduledTo ?? null,
        responsibleNote: d.responsibleNote || null,
        responsibleMemberIds: memberIdSet.size > 0 ? [...memberIdSet] : Prisma.DbNull,
        rescheduleHistory: historyValue,
        updatedById: user.id,
      },
      create: {
        activityId: d.activityId,
        status: d.status,
        reason: d.reason || null,
        rescheduledTo:
          d.status === "RESCHEDULED" && d.rescheduledTo
            ? new Date(`${d.rescheduledTo}T00:00:00`)
            : null,
        responsibleNote: d.responsibleNote || null,
        responsibleMemberIds: memberIdSet.size > 0 ? [...memberIdSet] : Prisma.DbNull,
        rescheduleHistory: historyValue,
        updatedById: user.id,
      },
    });
  } catch {
    return { error: "Could not save the monitoring outcome." };
  }

  const label = {
    IMPLEMENTED: "Implemented",
    NOT_IMPLEMENTED: "Not implemented",
    RESCHEDULED: "Rescheduled",
  }[d.status];

  await writeAudit({
    userId: user.id,
    action: "MONITORING_UPDATED",
    entityType: "ActivityProposal",
    entityId: d.activityId,
    entityLabel: proposal.title,
    previousState: previous
      ? { status: previous.status }
      : undefined,
    newState: {
      status: d.status,
      reason: d.reason || undefined,
      rescheduledTo: d.rescheduledTo || undefined,
    },
  });

  revalidatePath("/activities");
  revalidatePath(`/activities/${d.activityId}`);
  revalidatePath("/reports");
  revalidatePath(`/organizations/${proposal.organizationId}/monitoring`);

  return {
    success:
      d.status === "RESCHEDULED"
        ? `Marked as rescheduled — the original date was kept, the new target is ${d.rescheduledTo}.`
        : label === "Implemented"
          ? "Marked as implemented — the organization can now file its accomplishment report."
          : `Marked as ${label.toLowerCase()}.`,
  };
}