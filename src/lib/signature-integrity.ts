import { createHash } from "node:crypto";

/**
 * Tamper-evident signature attachment (§ integrity).
 *
 * On every sign action the server:
 *   1. captures a canonical hash of the routed document as it exists at that
 *      moment (`contentHash`): form key, entity, route version, org, cycle;
 *   2. chains it with the previous step's chain hash, the signer, role,
 *      method and timestamp into a new `chainHash`;
 *   3. stores all three on the step.
 *
 * `verifySignatureChain` recomputes the chain from the stored values. Any
 * edit that changes recorded signer/method/timestamp/version/entity — or any
 * break in the link between consecutive steps — makes verification fail.
 */

export type SignatureChainLink = {
  order: number;
  role: string;
  signedAt: Date | null;
  status: string;
  signatureMethod: string | null;
  signerId: string | null;
  chainHash: string | null;
  prevChainHash: string | null;
  contentHash: string | null;
};

export type SignatureChainVerification = {
  /** True only when every step verifies and the chain is fully linked. */
  ok: boolean;
  /** Number of signed (chained) steps for which the rule matched. */
  verified: number;
  total: number;
  links: { order: number; role: string; ok: boolean; reason: string }[];
};

/** Stable canonical document identity for the hash. Never reordered. */
export function signatureContentPayload(params: {
  entityType: string;
  entityId: string;
  formKey: string;
  title: string | null;
  version: number;
  orgId: string;
  academicYear: string;
}): string {
  return JSON.stringify({
    t: params.entityType,
    e: params.entityId,
    k: params.formKey,
    n: params.title ?? null,
    v: params.version,
    o: params.orgId,
    ay: params.academicYear,
  });
}

export function signatureContentHash(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

/** sha256(current step's commitment + previous link). */
export function hashChainStep(params: {
  role: string;
  signerId: string;
  signedAt: Date;
  method: string | null;
  contentHash: string;
  prevChainHash: string | null;
}): string {
  const { role, signerId, signedAt, method, contentHash, prevChainHash } = params;
  const digest = createHash("sha256");
  digest.update(String(prevChainHash ?? ""));
  digest.update("\x00");
  digest.update(role);
  digest.update("\x00");
  digest.update(signerId);
  digest.update("\x00");
  digest.update(signedAt.toISOString());
  digest.update("\x00");
  digest.update(method ?? "none");
  digest.update("\x00");
  digest.update(contentHash);
  return digest.digest("hex");
}

/**
 * Recompute the chain over the ordered step list and compare with the stored
 * values. Returns one verdict per step; the overall verdict is green only if
 * every signed link recomputes to the stored hash AND each step's
 * `prevChainHash` equals the previous step's computed chain hash.
 */
export function verifySignatureChain(steps: SignatureChainLink[]): SignatureChainVerification {
  const links: SignatureChainVerification["links"] = [];
  let expected: string | null = null;
  let verified = 0;

  const sorted = [...steps].sort((a, b) => a.order - b.order);
  let signed = 0;
  for (const s of sorted) {
    if (s.status !== "SIGNED") continue;
    signed += 1;
    if (!s.signedAt || !s.signerId) {
      links.push({ order: s.order, role: s.role, ok: false, reason: "Signature metadata missing." });
      continue;
    }
    const recomputed = hashChainStep({
      role: s.role,
      signerId: s.signerId,
      signedAt: s.signedAt,
      method: s.signatureMethod,
      contentHash: s.contentHash ?? "",
      prevChainHash: expected,
    });
    const linkOk = s.chainHash === recomputed && s.prevChainHash === expected;
    if (linkOk) verified += 1;
    expected = recomputed;
    links.push({
      order: s.order,
      role: s.role,
      ok: linkOk,
      reason:
        s.chainHash === recomputed
          ? s.prevChainHash === expected
            ? "Integrity verified."
            : "Previous link changed."
          : "Signature evidence does not match.",
    });
  }

  return {
    ok: signed > 0 && verified === signed && links.every((l) => l.ok),
    verified,
    total: signed,
    links,
  };
}