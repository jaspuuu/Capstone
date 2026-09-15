/**
 * One-time migration of the local filesystem storage into Supabase Storage.
 *
 * Reads every storedName referenced by Attachment rows, Organization logos,
 * and User signature images, then uploads the matching files from the local
 * storage directory into the Supabase bucket. Verifies each upload by
 * reading the bytes back through the Supabase driver.
 *
 * Usage (from repo root, with SUPABASE_STORAGE_* env present):
 *   npx tsx scripts/backfill-supabase-storage.ts
 *
 * Safe to re-run: uploads are idempotent (upsert) and skipped when the
 * bytes already match.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { STORAGE_DIR } from "../src/lib/attachments";
import {
  SUPABASE_STORAGE_ENABLED,
  SUPABASE_STORAGE_BUCKET,
  ensureSupabaseStorageBucket,
  supabaseStoragePut,
  supabaseStorageRead,
} from "../src/lib/supabase-storage";

async function main() {
  if (!SUPABASE_STORAGE_ENABLED) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run the backfill.");
  }

  const [attachments, logos, signatures] = await Promise.all([
    db.attachment.findMany({ select: { storedName: true } }),
    db.organization.findMany({
      where: { logoStoredName: { not: null } },
      select: { logoStoredName: true },
    }),
    db.user.findMany({
      where: { signatureImage: { not: null } },
      select: { signatureImage: true },
    }),
  ]);

  const names = Array.from(
    new Set(
      [...attachments.map((a) => a.storedName), ...logos.map((l) => l.logoStoredName!), ...signatures.map((s) => s.signatureImage!)]
        .filter(Boolean)
    )
  );

  console.log(`Bucket: ${SUPABASE_STORAGE_BUCKET}`);
  console.log(`Stored files to migrate: ${names.length}`);
  await ensureSupabaseStorageBucket();
  console.log("Bucket ready.");

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const name of names) {
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(/* turbopackIgnore: true */ STORAGE_DIR, name));
    } catch {
      console.log(`SKIP  ${name} (local file missing)`);
      skipped += 1;
      continue;
    }

    const existing = await supabaseStorageRead(name);
    if (existing && existing.equals(bytes)) {
      console.log(`OK    ${name} (already in sync)`);
      skipped += 1;
      continue;
    }

    try {
      await supabaseStoragePut(name, bytes, "application/octet-stream");
      const back = await supabaseStorageRead(name);
      if (back && back.equals(bytes)) {
        console.log(`UPLD  ${name} (${bytes.length} bytes)`);
        uploaded += 1;
      } else {
        console.log(`FAIL  ${name} (verify mismatch)`);
        failed += 1;
      }
    } catch (err) {
      console.log(`FAIL  ${name} (${err instanceof Error ? err.message : err})`);
      failed += 1;
    }
  }

  console.log(`\nUploaded: ${uploaded} | skipped: ${skipped} | failed: ${failed}`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});