"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AccountStatus, Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requirePermissionOrThrow } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import { isOfficerRole } from "@/lib/constants";

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

  // Officer positions derive from organization memberships — they are never
  // provisioned onto an account (§account model).
  if (isOfficerRole(d.role)) {
    return { error: "Officer roles are assigned through organization memberships, not here." };
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
  // Provisioning hygiene: legacy officer accounts keep their role, but an
  // admin cannot promote an account to an officer role here (§account model).
  if (isOfficerRole(d.role) && d.role !== existing.role) {
    return { error: "Officer roles are assigned through organization memberships, not here." };
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

const ACCOUNT_STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED", "ARCHIVED"] as const;

/**
 * Account lifecycle transition. `accountStatus` is the source of truth; the
 * denormalized `isActive` flag is derived so existing `.isActive` filters
 * behave identically. Only ACTIVE accounts may sign in.
 */
export async function setUserAccountStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requirePermissionOrThrow("users.manage");
  const id = String(formData.get("id") ?? "");
  const rawStatus = String(formData.get("status") ?? "");

  if (!(ACCOUNT_STATUSES as readonly string[]).includes(rawStatus)) {
    return { error: "Invalid account status." };
  }
  if (id === admin.id) {
    return { error: "You cannot change your own account status." };
  }

  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) return { error: "Account not found." };

  const accountStatus = rawStatus as AccountStatus;
  const isActive = accountStatus === "ACTIVE";

  await db.user.update({ where: { id }, data: { accountStatus, isActive } });
  // Suspend/deactivate/archive takes effect immediately by revoking sessions.
  if (!isActive) {
    await db.session.deleteMany({ where: { userId: id } });
  }

  await writeAudit({
    userId: admin.id,
    action: "USER_STATUS_CHANGED",
    entityType: "User",
    entityId: id,
    entityLabel: existing.email,
    previousState: { accountStatus: existing.accountStatus, isActive: existing.isActive },
    newState: { accountStatus, isActive },
  });
  revalidatePath("/users");
  return { success: "Account status updated." };
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
