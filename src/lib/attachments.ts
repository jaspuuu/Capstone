import { createHash, randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Attachment storage. Files live on disk under STORAGE_DIR (never web-served
 * directly); the database keeps metadata and downloads go through an
 * authenticated route handler.
 *
 * Configurable policy: allowed MIME types and size cap.
 */
export const STORAGE_DIR =
  process.env.ATTACHMENT_STORAGE_DIR ?? path.join(process.cwd(), "storage", "uploads");

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

/** Maps a parent entity type to its Prisma delegate name for ownership checks. */
export const ATTACHABLE_ENTITIES = ["Recognition", "ActivityProposal", "AccomplishmentReport"] as const;
export type AttachableEntity = (typeof ATTACHABLE_ENTITIES)[number];

export function isAttachableEntity(t: string): t is AttachableEntity {
  return (ATTACHABLE_ENTITIES as readonly string[]).includes(t);
}

/**
 * SF-001 accreditation checklist items a Recognition attachment may satisfy.
 * The application/renewal letter itself is the recognition submission, so it
 * has no upload kind; the other six requirements are tagged on upload and
 * drive the compliance indicators in the analytics dashboard.
 */
export const ATTACHMENT_KINDS = [
  "CONSTITUTION",
  "PLAN_OF_ACTIVITIES",
  "ACCOMPLISHMENT_REPORTS",
  "ADVISER_COMMITMENT",
  "CERTIFICATION",
  "FINANCIAL_REPORT",
] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  CONSTITUTION: "Constitution and By-Laws",
  PLAN_OF_ACTIVITIES: "Plan of Activities",
  ACCOMPLISHMENT_REPORTS: "Accomplishment Reports",
  ADVISER_COMMITMENT: "Adviser's Commitment Form",
  CERTIFICATION: "Dean's Certification",
  FINANCIAL_REPORT: "Financial Report",
};

export function isAttachmentKind(value: string): value is AttachmentKind {
  return (ATTACHMENT_KINDS as readonly string[]).includes(value);
}

export function validateFile(mimeType: string, sizeBytes: number): string | null {
  if (!ALLOWED_MIME_TYPES[mimeType]) {
    return "Only PDF, PNG, JPEG, WebP, or Word (.docx) files are allowed.";
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
  await mkdir(STORAGE_DIR, { recursive: true });
  await writeFile(path.join(/* turbopackIgnore: true */ STORAGE_DIR, storedName), bytes);
}

export async function deleteAttachmentFile(storedName: string): Promise<void> {
  try {
    await unlink(path.join(/* turbopackIgnore: true */ STORAGE_DIR, storedName));
  } catch {
    // Already gone — deleting the row is still the correct outcome.
  }
}

/** Content-Disposition-safe filename (strips quotes/control chars). */
export function safeDownloadName(fileName: string): string {
  return fileName.replaceAll(/["\\\r\n]/g, "_");
}

export function attachmentChecksum(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}
