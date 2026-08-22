import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import type { Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "organize_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  role: Role;
  collegeId: string | null;
  departmentId: string | null;
  isViewOnly: boolean;
  mustChangePassword: boolean;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a DB-backed session and sets the httpOnly cookie. */
export async function createSession(
  userId: string,
  meta?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
    },
  });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Resolves the signed-in user for the current request.
 * Memoized per request via React cache. Returns null when unauthenticated,
 * when the session expired, or when the account was deactivated.
 */
export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (!session.user.isActive) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    middleName: session.user.middleName,
    role: session.user.role,
    collegeId: session.user.collegeId,
    departmentId: session.user.departmentId,
    isViewOnly: session.user.isViewOnly,
    mustChangePassword: session.user.mustChangePassword,
  };
});

/** Deletes the current session (DB row + cookie). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await db.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => undefined);
  }
  store.delete(COOKIE_NAME);
}
