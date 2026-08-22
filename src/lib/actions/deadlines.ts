"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermissionOrThrow } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import {
  notifyUsers,
  organizationsForDeadline,
  officerAndAdviserIdsForOrgs,
} from "@/lib/notifications";

export type ActionState = { error?: string; success?: string };

const schema = z
  .object({
    name: z.string().trim().min(3, "Name must be at least 3 characters.").max(160),
    process: z.enum(["RECOGNITION", "RENEWAL", "ACTIVITY", "ACCOMPLISHMENT", "OTHER"]),
    academicYear: z.string().regex(/^\d{4}-\d{4}$/, "Academic year must look like 2026-2027."),
    startDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    scopeType: z.enum(["ALL", "MOTHER", "CHILD", "INDEPENDENT"]),
    scopeCollegeId: z.string().optional().or(z.literal("")),
    instructions: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((d) => d.dueDate > d.startDate, {
    message: "The deadline must be after the start date.",
    path: ["dueDate"],
  });

function parseDeadlineForm(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    process: formData.get("process"),
    academicYear: formData.get("academicYear"),
    startDate: formData.get("startDate"),
    dueDate: formData.get("dueDate"),
    scopeType: formData.get("scopeType"),
    scopeCollegeId: formData.get("scopeCollegeId") || "",
    instructions: formData.get("instructions") || "",
  });
}

export async function createDeadline(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requirePermissionOrThrow("deadline.manage");

  const parsed = parseDeadlineForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const created = await db.deadline.create({
    data: {
      name: d.name,
      process: d.process,
      academicYear: d.academicYear,
      startDate: d.startDate,
      dueDate: d.dueDate,
      scopeType: d.scopeType,
      scopeCollegeId: d.scopeCollegeId || null,
      instructions: d.instructions || null,
      createdById: user.id,
    },
  });

  await writeAudit({
    userId: user.id,
    action: "DEADLINE_CREATED",
    entityType: "Deadline",
    entityId: created.id,
    entityLabel: created.name,
    newState: { ...d },
  });

  // Part 9: fan out an automated notification to every covered org's
  // officers and advisers. Best-effort; failures are swallowed.
  try {
    const due = d.dueDate.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
    const orgIds = await organizationsForDeadline({ scopeType: d.scopeType, scopeCollegeId: d.scopeCollegeId || null });
    const audience = await officerAndAdviserIdsForOrgs(orgIds);
    await notifyUsers(audience, {
      type: "DEADLINE_NEW",
      title: `New deadline: ${created.name}`,
      body: `Due ${due}${d.instructions ? ` — ${d.instructions.slice(0, 160)}` : ""}`,
      link: "/deadlines",
    });
  } catch {
    // Never block deadline creation.
  }

  revalidatePath("/deadlines");
  revalidatePath("/dashboard");
  redirect("/deadlines");
}

export async function updateDeadline(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requirePermissionOrThrow("deadline.manage");
  const id = String(formData.get("id") ?? "");

  const parsed = parseDeadlineForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const existing = await db.deadline.findUnique({ where: { id } });
  if (!existing) return { error: "Deadline not found." };
  const d = parsed.data;

  await db.deadline.update({
    where: { id },
    data: {
      name: d.name,
      process: d.process,
      academicYear: d.academicYear,
      startDate: d.startDate,
      dueDate: d.dueDate,
      scopeType: d.scopeType,
      scopeCollegeId: d.scopeCollegeId || null,
      instructions: d.instructions || null,
    },
  });

  await writeAudit({
    userId: user.id,
    action: "DEADLINE_UPDATED",
    entityType: "Deadline",
    entityId: id,
    entityLabel: d.name,
    previousState: {
      name: existing.name,
      process: existing.process,
      academicYear: existing.academicYear,
      startDate: existing.startDate,
      dueDate: existing.dueDate,
      scopeType: existing.scopeType,
      scopeCollegeId: existing.scopeCollegeId,
    },
    newState: { ...d },
  });

  // Notify covered orgs when a live deadline materially changes.
  if (existing.isActive) {
    try {
      const due = d.dueDate.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
      const orgIds = await organizationsForDeadline({ scopeType: d.scopeType, scopeCollegeId: d.scopeCollegeId || null });
      const audience = await officerAndAdviserIdsForOrgs(orgIds);
      await notifyUsers(audience, {
        type: "DEADLINE_UPDATED",
        title: `Deadline updated: ${d.name}`,
        body: `Now due ${due}.`,
        link: "/deadlines",
      });
    } catch {
      // Never block deadline updates.
    }
  }

  revalidatePath("/deadlines");
  redirect("/deadlines");
}

export async function setDeadlineActive(formData: FormData): Promise<void> {
  const user = await requirePermissionOrThrow("deadline.manage");
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";

  const existing = await db.deadline.findUnique({ where: { id } });
  if (!existing) return;

  await db.deadline.update({ where: { id }, data: { isActive } });
  await writeAudit({
    userId: user.id,
    action: isActive ? "DEADLINE_UPDATED" : "DEADLINE_DEACTIVATED",
    entityType: "Deadline",
    entityId: id,
    entityLabel: existing.name,
    previousState: { isActive: existing.isActive },
    newState: { isActive },
  });
  revalidatePath("/deadlines");
}
