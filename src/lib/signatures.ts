import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/**
 * E-signature lookups for the SF forms. Wrapped in React's cache so a page
 * that renders several signatory lines for the same user hits the database
 * once per request.
 */

export type SignatureInfo = {
  userId: string;
  method: string | null;
  image: string | null;
  typed: string | null;
};

export function hasSignature(s: SignatureInfo | null): boolean {
  return Boolean(s && (s.image || s.typed));
}

export const getSignature = cache(async (userId: string): Promise<SignatureInfo | null> => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      signatureImage: true,
      signatureTyped: true,
      signatureMethod: true,
    },
  });
  if (!user) return null;
  return {
    userId: user.id,
    method: user.signatureMethod,
    image: user.signatureImage,
    typed: user.signatureTyped,
  };
});

/** First active user with the given role that actually saved a signature. */
async function firstSignedInRole(role: "OSAS" | "SOA"): Promise<SignatureInfo | null> {
  const user = await db.user.findFirst({
    where: { role, isActive: true, OR: [{ signatureImage: { not: null } }, { signatureTyped: { not: null } }] },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      signatureImage: true,
      signatureTyped: true,
      signatureMethod: true,
    },
  });
  if (!user) return null;
  return {
    userId: user.id,
    method: user.signatureMethod,
    image: user.signatureImage,
    typed: user.signatureTyped,
  };
}

/**
 * Signatures for the two fixed OSAS approver lines shared by every letter
 * form ("Recommending Approval" coordinator + "Approved/Disapproved"
 * director). Falls back to null when those staff have not signed yet.
 */
export const getApproversSignatures = cache(
  async (): Promise<{ coordinator: SignatureInfo | null; director: SignatureInfo | null }> => {
    const [coordinator, director] = await Promise.all([firstSignedInRole("SOA"), firstSignedInRole("OSAS")]);
    return { coordinator, director };
  }
);

/**
 * Batch lookup for a form's signatory slots. Accepts nullable ids, ignores
 * them, and returns only users who actually saved a signature so pages can
 * pass `sigMap.get(id)` straight into SfSig / SignatureMark.
 */
export async function getSignaturesFor(
  userIds: Array<string | null | undefined>
): Promise<Map<string, SignatureInfo>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const rows = await db.user.findMany({
    where: {
      id: { in: ids },
      OR: [{ signatureImage: { not: null } }, { signatureTyped: { not: null } }],
    },
    select: { id: true, signatureImage: true, signatureTyped: true, signatureMethod: true },
  });
  return new Map(
    rows.map((u) => [
      u.id,
      { userId: u.id, method: u.signatureMethod, image: u.signatureImage, typed: u.signatureTyped },
    ])
  );
}
