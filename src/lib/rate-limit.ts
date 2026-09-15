import "server-only";
import { db } from "@/lib/db";

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Fixed-window rate limit backed by the shared RateLimitBucket table so
 * counters stay consistent across serverless invocations. When a bucket does
 * not exist yet it is seeded with a count of 1; when the window has elapsed
 * the bucket is zeroed lazily rather than rejecting the caller.
 *
 * Returns `{ allowed: false, retryAfterSeconds }` once the limit is reached.
 * Callers map that to a friendly message or HTTP 429.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  const existing = await db.rateLimitBucket.findUnique({ where: { key } });
  if (!existing) {
    try {
      await db.rateLimitBucket.create({ data: { key, count: 1, resetAt } });
      return { allowed: true, remaining: Math.max(0, limit - 1) };
    } catch {
      // Raced with a concurrent seed; fall through to the read/update path.
    }
  }

  const bucket = existing ?? (await db.rateLimitBucket.findUnique({ where: { key } }));
  if (!bucket) {
    return { allowed: true, remaining: Math.max(0, limit - 1) };
  }

  if (bucket.resetAt <= now) {
    await db.rateLimitBucket.update({ where: { key }, data: { count: 1, resetAt } });
    return { allowed: true, remaining: Math.max(0, limit - 1) };
  }

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000)
    );
    return { allowed: false, retryAfterSeconds };
  }

  await db.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
  return { allowed: true, remaining: Math.max(0, limit - bucket.count - 1) };
}

/** Removes a bucket, e.g. clearing failed-attempt counts after a successful login. */
export async function clearRateLimit(key: string): Promise<void> {
  try {
    await db.rateLimitBucket.deleteMany({ where: { key } });
  } catch {
    // Best-effort; a stale bucket only means a stricter count for a while.
  }
}

/** Formats retryAfterSeconds into a short human message for server actions. */
export function rateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.round(retryAfterSeconds / 60));
  return `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/** Safe key segment for an IP-less environment (local dev, no proxy headers). */
export function ipKey(ip: string | null | undefined): string {
  return ip && ip !== "unknown" ? ip : "local";
}