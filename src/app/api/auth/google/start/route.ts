import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isHttpsRequest } from "@/lib/auth/cookie";
import { ipKey, rateLimit, rateLimitMessage } from "@/lib/rate-limit";

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

  // Rate-limit: 20 initiations per IP per hour — well above normal usage.
  const clientKey = ipKey(
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip")
  );
  const throttled = await rateLimit(`oauth:ip:${clientKey}`, 20, 60 * 60_000);
  if (!throttled.allowed) {
    return NextResponse.redirect(
      new URL(`/login?error=rate_limited&message=${encodeURIComponent(rateLimitMessage(throttled.retryAfterSeconds))}`, origin)
    );
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
    secure: await isHttpsRequest(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  response.cookies.set("g_state", state, cookieOptions);
  response.cookies.set("g_next", safeNext, cookieOptions);
  return response;
}
