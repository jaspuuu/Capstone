import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { getRequestMeta } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

function fail(origin: string) {
  return NextResponse.redirect(new URL("/login?error=google_failed", origin));
}

/**
 * Google OAuth callback: exchanges the code for tokens, verifies the email,
 * then signs the user in — auto-provisioning a least-privilege MEMBER account
 * on first sign-in (that is the "sign up with Google" path). Provisioned
 * accounts get a random unguessable password hash so password login stays
 * impossible for them.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    const store = await cookies();
    const expectedState = store.get("g_state")?.value;
    const safeNextRaw = store.get("g_next")?.value ?? "/dashboard";
    store.delete("g_state");
    store.delete("g_next");

    if (!code || !state || !expectedState || state !== expectedState) return fail(origin);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return fail(origin);

    // Exchange the authorization code for tokens.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail(origin);
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) return fail(origin);

    // Decode the id_token payload (signature already implied by the direct
    // token-endpoint exchange over TLS).
    const payload = JSON.parse(
      Buffer.from(tokens.id_token.split(".")[1] ?? "", "base64url").toString("utf8")
    ) as {
      email?: string;
      email_verified?: boolean;
      given_name?: string;
      family_name?: string;
      name?: string;
    };
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email || payload.email_verified !== true) return fail(origin);

    let user = await db.user.findUnique({ where: { email } });
    let provider: "google" | "signup-google" = "google";

    if (!user) {
      // First Google sign-in → provision a MEMBER account automatically.
      const first =
        payload.given_name || payload.name?.split(" ")[0] || "New";
      const last =
        payload.family_name || payload.name?.split(" ").slice(1).join(" ") || "User";
      user = await db.user.create({
        data: {
          email,
          firstName: first.slice(0, 60),
          lastName: last.slice(0, 60),
          // Unusable-by-design password: nobody knows this random value.
          passwordHash: await hashPassword(randomBytes(24).toString("hex")),
          role: "MEMBER",
          isActive: true,
        },
      });
      await writeAudit({
        userId: user.id,
        action: "USER_SIGNED_UP",
        entityType: "User",
        entityId: user.id,
        entityLabel: email,
        newState: { provider: "google", role: "MEMBER" },
      });
      provider = "signup-google";
    }

    if (!user.isActive) return fail(origin);

    const meta = await getRequestMeta();
    await createSession(user.id, meta);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await writeAudit({
      userId: user.id,
      action: "LOGIN",
      entityType: "User",
      entityId: user.id,
      entityLabel: user.email,
      newState: { provider },
    });

    const next =
      safeNextRaw.startsWith("/") && !safeNextRaw.startsWith("//")
        ? safeNextRaw
        : "/dashboard";
    return NextResponse.redirect(new URL(next, origin));
  } catch {
    return fail(origin);
  }
}
