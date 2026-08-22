import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Starts the Google OAuth flow. Requires GOOGLE_CLIENT_ID and
 * GOOGLE_CLIENT_SECRET; without them the user is bounced back to the login
 * page with a clear notice instead of a broken redirect.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=google_unconfigured", origin));
  }

  // Only relative next paths survive (open-redirect guard).
  const rawNext = new URL(request.url).searchParams.get("next") ?? "/dashboard";
  const safeNext =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  const state = randomBytes(16).toString("hex");
  const authorize = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${authorize}`
  );
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  response.cookies.set("g_state", state, cookieOptions);
  response.cookies.set("g_next", safeNext, cookieOptions);
  return response;
}
