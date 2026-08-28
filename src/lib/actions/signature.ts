"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import {
  deleteAttachmentFile,
  newStoredName,
  saveAttachmentFile,
} from "@/lib/attachments";

export type ActionState = { error?: string; success?: string };

/** Signature images are small by design; 512 KB decoded is generous. */
const MAX_SIGNATURE_BYTES = 512 * 1024;
const MAX_TYPED_LENGTH = 60;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodeDataUrl(dataUrl: string): { bytes: Buffer } | { error: string } {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) return { error: "The signature image must be a PNG." };
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length === 0) return { error: "The signature image is empty." };
  if (bytes.length > MAX_SIGNATURE_BYTES) {
    return { error: "The signature image is too large (max 512 KB)." };
  }
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    return { error: "That file is not a valid PNG image." };
  }
  return { bytes };
}

/**
 * Saves the current user's e-signature from any of the three inputs:
 * "draw" and "upload" arrive as PNG data URLs (the browser normalizes
 * uploads through a canvas), "type" arrives as plain text.
 */
export async function saveSignature(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireUser();
  const method = String(formData.get("method") ?? "");

  let signatureImage: string | null = null;
  let signatureTyped: string | null = null;

  if (method === "DRAW" || method === "UPLOAD") {
    const decoded = decodeDataUrl(String(formData.get("dataUrl") ?? ""));
    if ("error" in decoded) return { error: decoded.error };
    signatureImage = newStoredName("image/png");
    await saveAttachmentFile(signatureImage, decoded.bytes);
  } else if (method === "TYPE") {
    signatureTyped = String(formData.get("typed") ?? "").trim().replace(/\s+/g, " ");
    if (signatureTyped.length === 0) {
      return { error: "Type your full name exactly as you want it to appear." };
    }
    if (signatureTyped.length > MAX_TYPED_LENGTH) {
      return { error: `Keep the typed signature under ${MAX_TYPED_LENGTH} characters.` };
    }
  } else {
    return { error: "Choose how you want to sign." };
  }

  // Replace-or-set semantics: drop the previous image file when switching
  // away from an uploaded/drawn signature so storage never accumulates.
  const previous = await db.user.findUnique({
    where: { id: session.id },
    select: { signatureImage: true },
  });
  const oldImage = previous?.signatureImage ?? null;
  if (oldImage && !signatureImage) {
    await deleteAttachmentFile(oldImage);
  }

  await db.user.update({
    where: { id: session.id },
    data: { signatureImage, signatureTyped, signatureMethod: method },
  });

  await writeAudit({
    userId: session.id,
    action: "SIGNATURE_SAVED",
    entityType: "User",
    entityId: session.id,
    entityLabel: session.email,
    newState: { method },
  });

  revalidatePath("/profile/signature");
  revalidatePath("/profile");
  return { success: "Your signature has been saved." };
}

/** Clears the current user's saved signature entirely. */
export async function removeSignature(): Promise<ActionState> {
  const session = await requireUser();

  const previous = await db.user.findUnique({
    where: { id: session.id },
    select: { signatureImage: true },
  });
  if (previous?.signatureImage) {
    await deleteAttachmentFile(previous.signatureImage);
  }

  await db.user.update({
    where: { id: session.id },
    data: { signatureImage: null, signatureTyped: null, signatureMethod: null },
  });

  await writeAudit({
    userId: session.id,
    action: "SIGNATURE_REMOVED",
    entityType: "User",
    entityId: session.id,
    entityLabel: session.email,
  });

  revalidatePath("/profile/signature");
  revalidatePath("/profile");
  return { success: "Your signature has been removed." };
}
