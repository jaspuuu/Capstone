"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, getSessionUser } from "@/lib/auth/session";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { getRequestMeta } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "") || "/dashboard";

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const meta = await getRequestMeta();
  const user = await db.user.findUnique({ where: { email } });

  const invalid: LoginState = { error: "Invalid email or password." };
  if (!user || !user.isActive) {
    await writeAudit({
      action: "LOGIN_FAILED",
      entityType: "User",
      entityLabel: email,
      newState: { reason: user ? "account_inactive" : "unknown_email" },
    });
    return invalid;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await writeAudit({
      userId: user.id,
      action: "LOGIN_FAILED",
      entityType: "User",
      entityId: user.id,
      entityLabel: email,
    });
    return invalid;
  }

  await createSession(user.id, meta);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit({
    userId: user.id,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.email,
  });

  // Only allow relative paths to avoid open redirects.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  redirect(safeNext);
}

export async function logout(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    await writeAudit({
      userId: user.id,
      action: "LOGOUT",
      entityType: "User",
      entityId: user.id,
      entityLabel: user.email,
    });
  }
  await destroySession();
  redirect("/login");
}

export type ChangePasswordState = { error?: string; success?: string };

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await getSessionUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== confirm) return { error: "New password and confirmation do not match." };
  if (next === current) return { error: "The new password must be different from the current one." };

  const record = await db.user.findUnique({ where: { id: user.id } });
  if (!record) return { error: "Account not found." };

  const ok = await verifyPassword(current, record.passwordHash);
  if (!ok) return { error: "The current password is incorrect." };

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  await writeAudit({
    userId: user.id,
    action: "PASSWORD_CHANGED",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.email,
    newState: { selfChange: true },
  });
  return { success: "Your password has been updated." };
}
