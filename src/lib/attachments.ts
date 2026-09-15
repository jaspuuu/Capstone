import { createHash, randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { put, del, getDownloadUrl } from "@vercel/blob";
import {
  SUPABASE_STORAGE_ENABLED,
  supabaseStoragePut,
  supabaseStorageDelete,
  supabaseStorageRead,
} from "./supabase-storage";

/**
 * Attachment storage. Files live under an unguessable random name; the
 * database keeps metadata and downloads go through an authenticated route
 * handler that streams bytes per request.
 *
 * Three drivers behind one interface, selected by environment:
 * - local disk (STORAGE_DIR) during development / on a VM;
 * - Vercel Blob, whenever a BLOB_READ_WRITE_TOKEN is present;
 * - Supabase Storage (server-side service-role I/O, private bucket),
 *   whenever SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are present.
 *
 * Precedence: Vercel Blob token → Supabase — otherwise local disk.
 * Every in-app read still goes through the permission-checked download
 * route regardless of driver.
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

// ---------------------------------------------------------------------------
// Content sniffing (Phase 1). MIME headers are client-declared and cheap to
// forge; every upload also runs the real bytes against known magic signatures
// so a renamed .exe can never be stored as a "PDF". Zip-based office files
// are additionally required to contain their signature part inside the
// archive ([Content_Types].xml + word/ or xl/).
// ---------------------------------------------------------------------------

const ARCHIVE_MIME = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "word/document.xml",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "xl/workbook.xml",
} as const;

function isZip(bytes: Buffer): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    bytes[3] === 0x04
  );
}

/** True when the leading bytes of `bytes` match the declared MIME type. */
export function sniffMatchingBytes(mimeType: string, bytes: Buffer): boolean {
  if (mimeType === "application/pdf") {
    return bytes.length >= 5 && bytes.subarray(0, 5).equals(Buffer.from("%PDF-"));
  }
  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  const entry = ARCHIVE_MIME[mimeType as keyof typeof ARCHIVE_MIME];
  if (entry) {
    return isZip(bytes) && bytes.includes(entry);
  }
  // Unknown allowlisted types (future-proof) are accepted without a decoder.
  return true;
}

/**
 * Content-level validation used after reading the real bytes. Returns an
 * error string when the payload does not match the declared MIME type.
 */
export function validateFileBytes(mimeType: string, bytes: Buffer): string | null {
  if (bytes.length === 0) return "The selected file is empty.";
  if (!sniffMatchingBytes(mimeType, bytes)) {
    return "The file content does not match its declared type.";
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
    // Private access: the CDN never hosts anonymous URLs. Every read goes
    // through a freshly-signed short-lived URL on the authenticated route.
    await put(storedName, bytes, { access: "private", addRandomSuffix: false });
    return;
  }
  if (SUPABASE_STORAGE_ENABLED) {
    const mime = storedName.endsWith(".pdf")
      ? "application/pdf"
      : storedName.endsWith(".png")
        ? "image/png"
        : storedName.endsWith(".jpg")
          ? "image/jpeg"
          : storedName.endsWith(".webp")
            ? "image/webp"
            : storedName.endsWith(".docx")
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : storedName.endsWith(".xlsx")
                ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                : "application/octet-stream";
    await supabaseStoragePut(storedName, bytes, mime);
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
  if (SUPABASE_STORAGE_ENABLED) {
    await supabaseStorageDelete(storedName);
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
      // Private blobs have no public URL; mint a short-lived signed one.
      const url = await getDownloadUrl(storedName);
      const res = await fetch(url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  if (SUPABASE_STORAGE_ENABLED) {
    return supabaseStorageRead(storedName);
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
