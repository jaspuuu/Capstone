"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, getSessionUser } from "@/lib/auth/session";
import { verifyPassword, hashPassword, validatePasswordPolicy } from "@/lib/auth/password";
import { getRequestMeta } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import {
  clearRateLimit,
  ipKey,
  rateLimit,
  rateLimitMessage,
} from "@/lib/rate-limit";

const LOGIN_BURST_KEY = "burst:login";
const LOGIN_EMAIL_KEY = "attempt:login";
const SIGNUP_IP_KEY = "burst:signup";
const SIGNUP_EMAIL_KEY = "attempt:signup";
const PASSWORD_CHANGE_KEY = "attempt:password-change";

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
  const clientKey = ipKey(meta.ipAddress);

  // Two independent thresholds: a short per-device burst ceiling (10/min) and
  // a longer per-account window that resets on a successful sign-in.
  const burst = await rateLimit(`${LOGIN_BURST_KEY}:${clientKey}`, 10, 60_000);
  if (!burst.allowed) return { error: rateLimitMessage(burst.retryAfterSeconds) };
  const attempts = await rateLimit(`${LOGIN_EMAIL_KEY}:${email}`, 5, 15 * 60_000);
  if (!attempts.allowed) return { error: rateLimitMessage(attempts.retryAfterSeconds) };

  const user = await db.user.findUnique({ where: { email } });

  const invalid: LoginState = { error: "Invalid email or password." };
  if (!user || !user.isActive) {
    await writeAudit({
      action: "LOGIN_FAILED",
      entityType: "User",
      entityLabel: email,
      newState: {
        reason: user
          ? user.accountStatus === "SUSPENDED" ||
            user.accountStatus === "DEACTIVATED" ||
            user.accountStatus === "ARCHIVED" ||
            user.accountStatus === "PENDING"
            ? `account_${user.accountStatus.toLowerCase()}`
            : "account_inactive"
          : "unknown_email",
      },
    });
    // Existing accounts surface their lifecycle state so the person knows who
    // to contact; unknown emails stay generic to avoid account enumeration.
    if (user) {
      if (user.accountStatus === "SUSPENDED") {
        return { error: "This account is suspended. Contact OSAS for assistance." };
      }
      if (user.accountStatus === "PENDING") {
        return { error: "This account is awaiting verification. Contact OSAS if this is unexpected." };
      }
      if (user.accountStatus === "ARCHIVED") {
        return { error: "This account has been archived." };
      }
      return { error: "This account has been deactivated." };
    }
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
  // A successful sign-in is proof the account is authorized; reset the
  // attempt counters so legitimate users are never progressively locked out.
  await Promise.all([
    clearRateLimit(`${LOGIN_EMAIL_KEY}:${email}`),
    clearRateLimit(`${LOGIN_BURST_KEY}:${clientKey}`),
    db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ]);
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

/**
 * "Sign out all devices": revokes every session for the account including the
 * current one, then redirects to the login page.
 */
export async function revokeAllSessions(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    await db.session.deleteMany({ where: { userId: user.id } });
    await writeAudit({
      userId: user.id,
      action: "SESSIONS_REVOKED",
      entityType: "User",
      entityId: user.id,
      entityLabel: user.email,
    });
  }
  await destroySession();
  redirect("/login?notice=sessions_revoked");
}

export type SignUpState = { error?: string };

/**
 * Public self-registration. New accounts always land on the least-privileged
 * MEMBER role — privileged roles can only be granted by an administrator.
 */
export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const middleName = String(formData.get("middleName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!firstName || !lastName) return { error: "Enter your first and last name." };
  if (firstName.length > 60 || lastName.length > 60 || middleName.length > 60)
    return { error: "Names may not exceed 60 characters." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  const policyError = validatePasswordPolicy(password);
  if (policyError) return { error: policyError };
  if (password !== confirm) return { error: "Password and confirmation do not match." };

  const meta = await getRequestMeta();
  const clientKey = ipKey(meta.ipAddress);

  const burst = await rateLimit(`${SIGNUP_IP_KEY}:${clientKey}`, 10, 60 * 60_000);
  if (!burst.allowed) return { error: rateLimitMessage(burst.retryAfterSeconds) };
  const account = await rateLimit(`${SIGNUP_EMAIL_KEY}:${email}`, 3, 60 * 60_000);
  if (!account.allowed) return { error: rateLimitMessage(account.retryAfterSeconds) };

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { error: "An account with this email already exists. Try signing in instead." };
  }

  const user = await db.user.create({
    data: {
      email,
      firstName,
      middleName: middleName || null,
      lastName,
      passwordHash: await hashPassword(password),
      role: "MEMBER",
      isActive: true,
      lastLoginAt: new Date(),
    },
    select: { id: true, email: true },
  });

  await createSession(user.id, meta);
  await writeAudit({
    userId: user.id,
    action: "USER_SIGNED_UP",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.email,
    newState: { provider: "password", role: "MEMBER" },
  });

  redirect("/dashboard");
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

  const policyError = validatePasswordPolicy(next);
  if (policyError) return { error: policyError };
  if (next !== confirm) return { error: "New password and confirmation do not match." };
  if (next === current) return { error: "The new password must be different from the current one." };

  const meta = await getRequestMeta();
  const throttled = await rateLimit(`${PASSWORD_CHANGE_KEY}:${user.id}`, 5, 10 * 60_000);
  if (!throttled.allowed) return { error: rateLimitMessage(throttled.retryAfterSeconds) };

  const record = await db.user.findUnique({ where: { id: user.id } });
  if (!record) return { error: "Account not found." };

  const ok = await verifyPassword(current, record.passwordHash);
  if (!ok) return { error: "The current password is incorrect." };

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  // Session rotation: after a password change, every other device is signed
  // out but the current request gets a freshly minted session so the user
  // stays signed in.
  await db.session.deleteMany({ where: { userId: user.id } });
  await createSession(user.id, meta);
  await writeAudit({
    userId: user.id,
    action: "PASSWORD_CHANGED",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.email,
    newState: { selfChange: true, sessionsRotated: true },
  });
  return { success: "Your password has been updated. Other devices were signed out." };
}
