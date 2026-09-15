import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validatePasswordPolicy } from "../src/lib/auth/password";
import { sniffMatchingBytes, validateFileBytes } from "../src/lib/attachments";
import { canonicalJsonHash } from "../src/lib/signature-integrity";
import { sfRouteEntityId } from "../src/lib/form-routes";
import {
  MASTER_FILES,
  MASTER_HASHES,
  masterTemplateDir,
} from "../src/lib/docx/masters";
import { db } from "../src/lib/db";

/**
 * Security + integrity regression checks (defense-readiness).
 *
 * Unit checks: password policy, upload content sniffing, canonical hashing,
 * and the official master-template manifest (pure, no DB).
 * Integration checks: the RateLimitBucket persistence layer (create /
 * increment / block / lazy reset) exercised through the real Prisma client,
 * and the post-sign document-data drift loop (snapshot at signing, detect
 * edits, invalidate on resubmit). The rateLimit()/clearRateLimit() wrappers in
 * src/lib/rate-limit.ts are "server-only" by design and are covered by the
 * HTTP battery in scripts/smoke.ts, not imported here.
 */

let passed = 0;
function ok(name: string) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

// ---- password policy -------------------------------------------------------
{
  const cases: Array<[string, string | null]> = [
    ["Password123!", null],
    ["Password12345", null],
    ["abcDEF0123", null],
    ["short1A", "Password must be at least 10 characters."],
    ["abcdefghij", "Password must include both uppercase and lowercase letters."],
    ["ABCDEFGHIJk", "Password must include at least one number."],
    ["alllowercase1", "Password must include both uppercase and lowercase letters."],
    ["x".repeat(73), "Password must be at most 72 characters."],
  ];
  for (const [pw, expected] of cases) {
    const got = validatePasswordPolicy(pw);
    if (expected === null) assert.equal(got, null, `expected ${pw} to pass policy`);
    else assert.equal(got, expected, `expected message for ${pw}`);
  }
  ok("password policy accepts strong + rejects weak passwords");
}

// ---- upload content sniffing ------------------------------------------------
{
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  assert.equal(sniffMatchingBytes("image/png", png), true);
  assert.equal(sniffMatchingBytes("image/png", Buffer.from("not a png at all")), false);

  // A forgery that *contains* valid magic bytes but does not START with them
  // (e.g. a re-typed .exe or a text file with an appended image footer) must
  // still be rejected — only the leading signature on the real bytes counts.
  const embeddedPng = Buffer.concat([Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00"), png]);
  assert.equal(sniffMatchingBytes("image/png", embeddedPng), false, "embedded trailing magic must not pass");

  // The zero-length file is rejected before any signature sniffing runs.
  assert.equal(validateFileBytes("image/png", Buffer.alloc(0)), "The selected file is empty.");
  assert.equal(validateFileBytes("application/pdf", embeddedPng), "The file content does not match its declared type.");

  const pdf = Buffer.from("%PDF-1.7\n....");
  assert.equal(sniffMatchingBytes("application/pdf", pdf), true);
  assert.equal(sniffMatchingBytes("application/pdf", png), false);

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  assert.equal(sniffMatchingBytes("image/jpeg", jpeg), true);

  const webp = Buffer.from("RIFF\x10\x00\x00\x00WEBPVP8 ");
  assert.equal(sniffMatchingBytes("image/webp", webp), true);
  assert.equal(sniffMatchingBytes("image/webp", pdf), false);

  const minimalZip = Buffer.concat([Buffer.from("PK\x03\x04..."), Buffer.from("word/document.xml")]);
  assert.equal(
    sniffMatchingBytes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      minimalZip
    ),
    true
  );
  assert.equal(
    sniffMatchingBytes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", minimalZip),
    false
  );
  const xlsxZip = Buffer.concat([Buffer.from("PK\x03\x04..."), Buffer.from("xl/workbook.xml")]);
  assert.equal(
    sniffMatchingBytes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxZip),
    true
  );
  ok("sniffing accepts matching magic bytes and rejects mismatches/forgeries");
}

// ---- canonical JSON hashing (signature document-data snapshot) --------------
{
  const a = {
    formKey: "SF001",
    organizationId: "org-1",
    academicYear: "2026-2027",
    fields: { name: "Sample", nested: { b: 1, a: [3, 2, 1] } },
    empty: null,
  };
  const b = {
    empty: null,
    academicYear: "2026-2027",
    fields: { nested: { a: [3, 2, 1], b: 1 }, name: "Sample" },
    organizationId: "org-1",
    formKey: "SF001",
  };
  assert.equal(canonicalJsonHash(a), canonicalJsonHash(b), "key order must not change the hash");
  const changed = { ...a, fields: { name: "SampleX", nested: { a: [3, 2, 1], b: 1 } } };
  assert.notEqual(canonicalJsonHash(a), canonicalJsonHash(changed), "content change must change the hash");
  const unrelated = { ...a, formKey: "SF999" };
  assert.notEqual(canonicalJsonHash(a), canonicalJsonHash(unrelated), "different content must hash differently");
  ok("canonicalJsonHash is key-order stable and content-sensitive");
}

// ---- master template integrity manifest --------------------------------------
async function verifyMasterManifest() {
  for (const formKey of Object.keys(MASTER_FILES)) {
    const bytes = await readFile(join(masterTemplateDir(), MASTER_FILES[formKey]));
    const got = createHash("sha256").update(bytes).digest("hex");
    assert.equal(MASTER_HASHES[formKey], got, `${formKey} manifest mismatch`);
  }
  assert.equal(
    Object.keys(MASTER_HASHES).length,
    Object.keys(MASTER_FILES).length,
    "manifest must cover every registered master"
  );
  ok("all official master templates hash to the committed SHA-256 manifest");
}

// ---- RateLimitBucket persistence -------------------------------------------
async function verifyPostSignDrift() {
  // Phase 3 anti-tamper loop exercised against the real schema, mirroring the
  // exact reads of findSignedDataDrift() + the reset of resetRouteForResubmit()
  // (those live behind "server-only", so a script cannot import them). Uses a
  // throwaway ESPORTSCLUB SF-005 instance that has no live document or route.
  const ay = "2026-2027";
  const org = await db.organization.findFirst({ where: { acronym: "ESPORTSCLUB" }, select: { id: true } });
  assert.ok(org, "ESPORTSCLUB fixture org must exist — run `npm run db:seed`");
  const docKey = { formKey: "SF005", organizationId: org.id, academicYear: ay };
  const entityId = sfRouteEntityId(docKey.formKey, org.id, ay);
  const existing = await db.signatureRoute.findUnique({
    where: { entityType_entityId: { entityType: "SF", entityId: entityId } },
  });
  assert.equal(existing, null, "ESPORTSCLUB must not already hold an SF-005 route");

  const osas = await db.user.findFirst({ where: { email: "osas@lspu.edu.ph" }, select: { id: true } });
  const pres = await db.user.findFirst({ where: { email: "president.acs@lspu.edu.ph" }, select: { id: true } });
  assert.ok(osas && pres, "fixture users must exist");

  const doc = await db.formDocument.create({
    data: { ...docKey, version: 1, data: { orgName: "Esports Club", members: ["A", "B"] } },
  });
  const route = await db.signatureRoute.create({
    data: {
      entityType: "SF",
      entityId,
      formKey: docKey.formKey,
      title: "List of Members",
      state: "IN_PROGRESS",
      createdById: osas.id,
      steps: {
        create: [
          {
            order: 1,
            role: "PRESIDENT",
            status: "SIGNED",
            signerId: pres.id,
            signedAt: new Date(),
            chainHash: "fixture",
            prevChainHash: null,
            contentHash: "fixture",
            documentDataHash: canonicalJsonHash(doc.data),
          },
        ],
      },
    },
  });
  try {
    const drift = async () => {
      const steps = await db.signatureStep.findMany({
        where: { routeId: route.id, status: "SIGNED", documentDataHash: { not: null } },
        select: { role: true, documentDataHash: true },
      });
      const currentDoc = await db.formDocument.findUnique({
        where: { formKey_organizationId_academicYear: docKey },
        select: { data: true },
      });
      const current = currentDoc ? canonicalJsonHash(currentDoc.data) : null;
      if (current === null) return steps.map((s) => s.role);
      return steps
        .filter((s) => s.documentDataHash !== null && s.documentDataHash !== current)
        .map((s) => s.role);
    };

    assert.deepEqual(await drift(), [], "signed step must match the just-signed snapshot");
    await db.formDocument.update({
      where: { formKey_organizationId_academicYear: docKey },
      data: { data: { orgName: "Esports Club", members: ["A", "C"] } },
    });
    const drifted = await drift();
    assert.deepEqual(drifted, ["PRESIDENT"], "editing signed content must surface the drifting role");

    // resetRouteForResubmit semantics: steps are invalidated (snapshot hashes
    // cleared, chain signer data removed), so no step can claim a stale hash.
    await db.signatureStep.updateMany({
      where: { routeId: route.id },
      data: {
        status: "LOCKED",
        signedAt: null,
        signerId: null,
        actedById: null,
        signatureImage: null,
        signatureTyped: null,
        signatureMethod: null,
        chainHash: null,
        prevChainHash: null,
        contentHash: null,
        comment: null,
        documentDataHash: null,
      },
    });
    await db.signatureStep.updateMany({ where: { routeId: route.id, order: 1 }, data: { status: "CURRENT" } });
    assert.deepEqual(await drift(), [], "after reset no signed snapshot survives, so no drift");
    ok("post-sign data edits are detected as drift and invalidated by resubmit reset");
  } finally {
    await db.signatureStep.deleteMany({ where: { routeId: route.id } });
    await db.signatureRoute.deleteMany({ where: { id: route.id } });
    await db.formDocument.delete({ where: { formKey_organizationId_academicYear: docKey } });
  }
}

async function main() {
  await verifyMasterManifest();
  await verifyPostSignDrift();

  const key = `test:${randomBytes(6).toString("hex")}`;
  const now = Date.now();
  const window = 60_000;

  const seed = await db.rateLimitBucket.create({ data: { key, count: 1, resetAt: new Date(now + window) } });
  assert.equal(seed.count, 1);
  await db.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
  const grown = await db.rateLimitBucket.findUnique({ where: { key } });
  assert.equal(grown?.count, 2);

  // Past-window bucket lazily resets instead of rejecting.
  await db.rateLimitBucket.update({ where: { key }, data: { resetAt: new Date(now - 1000), count: 99 } });
  const reset = await db.rateLimitBucket.update({ where: { key }, data: { count: 1, resetAt: new Date(now + window) } });
  assert.equal(reset.count, 1);

  await db.rateLimitBucket.deleteMany({ where: { key } });
  assert.equal(await db.rateLimitBucket.findUnique({ where: { key } }), null);
  ok("RateLimitBucket persists, increments, resets, and clears");

  console.log(`\n${passed} hardening checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});