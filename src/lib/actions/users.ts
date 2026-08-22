"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requirePermissionOrThrow } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";

export type ActionState = { error?: string; success?: string };

const baseSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  middleName: z.string().trim().max(80).optional().or(z.literal("")),
  role: z.enum([
    "OSAS",
    "SOA",
    "DEAN",
    "ADVISER_REGULAR",
    "ADVISER_PARTTIME",
    "PRESIDENT",
    "SECRETARY",
    "MEMBER",
  ]),
  collegeId: z.string().optional().or(z.literal("")),
  departmentId: z.string().optional().or(z.literal("")),
  studentNumber: z.string().trim().max(20).optional().or(z.literal("")),
  positionTitle: z.string().trim().max(120).optional().or(z.literal("")),
  isViewOnly: z.coerce.boolean().optional(),
});

const createSchema = baseSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters.").max(72),
});

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requirePermissionOrThrow("users.manage");

  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    middleName: formData.get("middleName") || "",
    role: formData.get("role"),
    collegeId: formData.get("collegeId") || "",
    departmentId: formData.get("departmentId") || "",
    studentNumber: formData.get("studentNumber") || "",
    positionTitle: formData.get("positionTitle") || "",
    isViewOnly: formData.get("isViewOnly") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  // Deans must be attached to a college.
  if (d.role === "DEAN" && !d.collegeId) {
    return { error: "A dean must be assigned to a college." };
  }

  const existing = await db.user.findUnique({ where: { email: d.email } });
  if (existing) return { error: "An account with this email already exists." };

  try {
    const user = await db.user.create({
      data: {
        email: d.email,
        passwordHash: await hashPassword(d.password),
        firstName: d.firstName,
        lastName: d.lastName,
        middleName: d.middleName || null,
        role: d.role as Role,
        collegeId: d.collegeId || null,
        departmentId: d.departmentId || null,
        studentNumber: d.studentNumber || null,
        positionTitle: d.positionTitle || null,
        isViewOnly: d.isViewOnly ?? false,
        mustChangePassword: true,
      },
    });
    await writeAudit({
      userId: admin.id,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      entityLabel: user.email,
      newState: { role: d.role, collegeId: d.collegeId, isViewOnly: d.isViewOnly ?? false },
    });
  } catch {
    return { error: "Could not create the account. The student number may already be in use." };
  }

  revalidatePath("/users");
  redirect("/users");
}

export async function updateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requirePermissionOrThrow("users.manage");
  const id = String(formData.get("id") ?? "");

  const parsed = baseSchema.safeParse({
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    middleName: formData.get("middleName") || "",
    role: formData.get("role"),
    collegeId: formData.get("collegeId") || "",
    departmentId: formData.get("departmentId") || "",
    studentNumber: formData.get("studentNumber") || "",
    positionTitle: formData.get("positionTitle") || "",
    isViewOnly: formData.get("isViewOnly") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) return { error: "User not found." };

  // Safety rails: an admin cannot change their own role or lock themselves out.
  if (id === admin.id && d.role !== existing.role) {
    return { error: "You cannot change your own role." };
  }
  if (d.role === "DEAN" && !d.collegeId) {
    return { error: "A dean must be assigned to a college." };
  }

  const emailClash = await db.user.findFirst({ where: { email: d.email, NOT: { id } } });
  if (emailClash) return { error: "Another account already uses this email." };

  try {
    await db.user.update({
      where: { id },
      data: {
        email: d.email,
        firstName: d.firstName,
        lastName: d.lastName,
        middleName: d.middleName || null,
        role: d.role as Role,
        collegeId: d.collegeId || null,
        departmentId: d.departmentId || null,
        studentNumber: d.studentNumber || null,
        positionTitle: d.positionTitle || null,
        isViewOnly: d.isViewOnly ?? false,
      },
    });
  } catch {
    return { error: "Could not update the account." };
  }

  await writeAudit({
    userId: admin.id,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: id,
    entityLabel: d.email,
    previousState: {
      email: existing.email,
      role: existing.role,
      collegeId: existing.collegeId,
      departmentId: existing.departmentId,
      isViewOnly: existing.isViewOnly,
      isActive: existing.isActive,
    },
    newState: { email: d.email, role: d.role, collegeId: d.collegeId, departmentId: d.departmentId, isViewOnly: d.isViewOnly ?? false },
  });

  revalidatePath("/users");
  redirect("/users");
}

export async function setUserActive(formData: FormData): Promise<void> {
  const admin = await requirePermissionOrThrow("users.manage");
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";

  if (id === admin.id) return; // cannot deactivate yourself

  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) return;

  await db.user.update({ where: { id }, data: { isActive } });
  // Revoke active sessions so deactivation takes effect immediately.
  if (!isActive) {
    await db.session.deleteMany({ where: { userId: id } });
  }

  await writeAudit({
    userId: admin.id,
    action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    entityType: "User",
    entityId: id,
    entityLabel: existing.email,
    previousState: { isActive: existing.isActive },
    newState: { isActive },
  });
  revalidatePath("/users");
}

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requirePermissionOrThrow("users.manage");
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) return { error: "User not found." };

  await db.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await db.session.deleteMany({ where: { userId: id } });
  await writeAudit({
    userId: admin.id,
    action: "PASSWORD_CHANGED",
    entityType: "User",
    entityId: id,
    entityLabel: existing.email,
    newState: { resetByAdmin: true },
  });
  return { success: "Password has been reset and active sessions were signed out." };
}
