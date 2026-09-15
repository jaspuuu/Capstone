import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Password policy (Phase 1 hardening), enforced at every place a password is
 * set: self-signup, self password change, and admin create/reset. At least 10
 * characters with mixed case and a digit — long enough to resist offline
 * cracking yet forgiving for students — and capped at 72 bytes because bcrypt
 * silently truncates beyond that. Returns a friendly error, or null when the
 * password is acceptable.
 */
export function validatePasswordPolicy(plain: string): string | null {
  if (plain.length < 10) return "Password must be at least 10 characters.";
  if (plain.length > 72) return "Password must be at most 72 characters.";
  if (!/[A-Z]/.test(plain) || !/[a-z]/.test(plain)) {
    return "Password must include both uppercase and lowercase letters.";
  }
  if (!/\d/.test(plain)) return "Password must include at least one number.";
  return null;
}
