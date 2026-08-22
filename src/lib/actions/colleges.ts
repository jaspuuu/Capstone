"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermissionOrThrow } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";

export type ActionState = { error?: string; success?: string };

const collegeSchema = z.object({
  name: z.string().trim().min(3, "College name is required.").max(160),
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters.")
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and dashes only.")
    .transform((s) => s.toUpperCase()),
  deanId: z.string().optional().or(z.literal("")),
});

const departmentSchema = z.object({
  name: z.string().trim().min(3, "Department name is required.").max(160),
  code: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and dashes only.")
    .transform((s) => s.toUpperCase()),
  collegeId: z.string().min(1, "Select a college."),
});

export async function createCollege(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requirePermissionOrThrow("college.manage");

  const parsed = collegeSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    deanId: formData.get("deanId") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  try {
    const college = await db.college.create({
      data: { name: d.name, code: d.code, deanId: d.deanId || null },
    });
    // Keep the dean account scoped to this college.
    if (d.deanId) {
      await db.user.update({ where: { id: d.deanId }, data: { collegeId: college.id } });
    }
    await writeAudit({
      userId: admin.id,
      action: "COLLEGE_CREATED",
      entityType: "College",
      entityId: college.id,
      entityLabel: college.name,
      newState: { name: d.name, code: d.code },
    });
  } catch {
    return { error: "Could not create the college — the name or code may already exist." };
  }
  revalidatePath("/colleges");
  return { success: `College ${d.code} created.` };
}

export async function updateCollege(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requirePermissionOrThrow("college.manage");
  const id = String(formData.get("id") ?? "");

  const parsed = collegeSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    deanId: formData.get("deanId") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const existing = await db.college.findUnique({ where: { id } });
  if (!existing) return { error: "College not found." };
  const d = parsed.data;

  try {
    await db.college.update({
      where: { id },
      data: { name: d.name, code: d.code, deanId: d.deanId || null },
    });
    // Keep the dean account scoped to this college.
    if (d.deanId) {
      await db.user.update({ where: { id: d.deanId }, data: { collegeId: id } });
    }
  } catch {
    return { error: "Could not update the college — the name or code may already exist." };
  }

  await writeAudit({
    userId: admin.id,
    action: "COLLEGE_UPDATED",
    entityType: "College",
    entityId: id,
    entityLabel: d.name,
    previousState: { name: existing.name, code: existing.code, deanId: existing.deanId },
    newState: { name: d.name, code: d.code, deanId: d.deanId || null },
  });
  revalidatePath("/colleges");
  return { success: "College updated." };
}

export async function createDepartment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requirePermissionOrThrow("college.manage");

  const parsed = departmentSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    collegeId: formData.get("collegeId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  try {
    const dept = await db.department.create({ data: d });
    await writeAudit({
      userId: admin.id,
      action: "DEPARTMENT_CREATED",
      entityType: "Department",
      entityId: dept.id,
      entityLabel: `${d.name} (${d.code})`,
      newState: d,
    });
  } catch {
    return { error: "Could not create the department — the code may already exist." };
  }
  revalidatePath("/colleges");
  return { success: "Department created." };
}
