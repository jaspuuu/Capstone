import { createHash, randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { put, del, head } from "@vercel/blob";

/**
 * Attachment storage. Files live under an unguessable random name; the
 * database keeps metadata and downloads go through an authenticated route
 * handler that streams bytes per request.
 *
 * Two drivers behind one interface:
 * - local disk (STORAGE_DIR) during development / on a VM;
 * - Vercel Blob in production, selected automatically whenever a
 *   BLOB_READ_WRITE_TOKEN is present (serverless disks are ephemeral).
 *   Blob objects are access-public but carry the same unguessable-random-
 *   name guarantee as local storage, and all in-app reads still go through
 *   the permission-checked download route.
 *
 * Configurable policy: allowed MIME types and size cap.
 */
const BLOB_ENABLED = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export const STORAGE_DIR =
  process.env.ATTACHMENT_STORAGE_DIR ?? path.join(process.cwd(), "storage", "uploads");

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

/** Maps a parent entity type to its Prisma delegate name for ownership checks. */
export const ATTACHABLE_ENTITIES = ["Recognition", "ActivityProposal", "AccomplishmentReport"] as const;
export type AttachableEntity = (typeof ATTACHABLE_ENTITIES)[number];

export function isAttachableEntity(t: string): t is AttachableEntity {
  return (ATTACHABLE_ENTITIES as readonly string[]).includes(t);
}

export { ATTACHMENT_KINDS, type AttachmentKind, ATTACHMENT_KIND_LABELS, isAttachmentKind } from "./attachment-types";

export function validateFile(mimeType: string, sizeBytes: number): string | null {
  if (!ALLOWED_MIME_TYPES[mimeType]) {
    return "Only PDF, PNG, JPEG, WebP, Word (.docx), or Excel (.xlsx) files are allowed.";
  }
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    return "Files may not exceed 10 MB.";
  }
  if (sizeBytes === 0) {
    return "The selected file is empty.";
  }
  return null;
}

/** Random, unguessable on-disk filename that preserves the extension. */
export function newStoredName(mimeType: string): string {
  const ext = ALLOWED_MIME_TYPES[mimeType] ?? "";
  return `${randomBytes(24).toString("hex")}${ext}`;
}

export async function saveAttachmentFile(storedName: string, bytes: Buffer): Promise<void> {
  if (BLOB_ENABLED) {
    await put(storedName, bytes, { access: "public", addRandomSuffix: false });
    return;
  }
  await mkdir(STORAGE_DIR, { recursive: true });
  await writeFile(path.join(/* turbopackIgnore: true */ STORAGE_DIR, storedName), bytes);
}

export async function deleteAttachmentFile(storedName: string): Promise<void> {
  if (BLOB_ENABLED) {
    try {
      await del(storedName);
    } catch {
      // Already gone — deleting the row is still the correct outcome.
    }
    return;
  }
  try {
    await unlink(path.join(/* turbopackIgnore: true */ STORAGE_DIR, storedName));
  } catch {
    // Already gone — deleting the row is still the correct outcome.
  }
}

/** Loads the raw bytes for the download route; null when the file is gone. */
export async function readAttachmentFile(storedName: string): Promise<Buffer | null> {
  if (BLOB_ENABLED) {
    try {
      const meta = await head(storedName);
      const res = await fetch(meta.downloadUrl);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  try {
    return await readFile(path.join(/* turbopackIgnore: true */ STORAGE_DIR, storedName));
  } catch {
    return null;
  }
}

/** Content-Disposition-safe filename (strips quotes/control chars). */
export function safeDownloadName(fileName: string): string {
  return fileName.replaceAll(/["\\\r\n]/g, "_");
}

export function attachmentChecksum(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}
