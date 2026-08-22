import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistic route protection only (Next.js 16 proxy convention).
 * Real authorization is enforced server-side in layouts, pages and every
 * server action - never here alone.
 */

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  // Google OAuth round-trip must stay reachable while signed out.
  "/api/auth/google/start",
  "/api/auth/google/callback",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(
    process.env.SESSION_COOKIE_NAME || "organize_session"
  );

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSessionCookie && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // NOTE: no presence-based bounce away from /login. A stale cookie would
  // otherwise loop /login -> /dashboard -> /login forever. The login page
  // validates the session properly and redirects real users itself.

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip static assets and Next internals; everything else passes through.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|ttf|woff2?|otf)$).*)",
  ],
};
