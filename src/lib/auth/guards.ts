import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser, type AuthUser } from "@/lib/auth/session";
import { can, canAny, type Permission } from "@/lib/auth/rbac";

/** Requires an authenticated, active user or redirects to /login. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Requires a specific permission or redirects to /forbidden.
 * Used by every protected page AND every server action (§11, §44).
 */
export async function requirePermission(permission: Permission): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/forbidden");
  return user;
}

export async function requireAnyPermission(permissions: Permission[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!canAny(user, permissions)) redirect("/forbidden");
  return user;
}

/** For server actions: throws instead of redirecting (actions must not silently redirect on authz failure). */
export async function requirePermissionOrThrow(permission: Permission): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user, permission)) {
    throw new Error("You do not have permission to perform this action.");
  }
  return user;
}

export async function getRequestMeta() {
  try {
    const h = await headers();
    return {
      ipAddress:
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        h.get("x-real-ip") ??
        null,
      userAgent: h.get("user-agent"),
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}
