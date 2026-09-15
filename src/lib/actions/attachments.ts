"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermissionOrThrow, requireUser } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import {
  ATTACHABLE_ENTITIES,
  deleteAttachmentFile,
  isAttachmentKind,
  isAttachableEntity,
  newStoredName,
  saveAttachmentFile,
  validateFile,
  type AttachmentKind,
} from "@/lib/attachments";
import {
  canDeleteAttachment,
  canManageAttachments,
  loadAttachableParent,
} from "@/lib/attachment-access";

export type ActionState = { error?: string; success?: string };

const OTHER_PARENT_PATHS: Record<string, (id: string) => string> = {
  ActivityProposal: (id) => `/activities/${id}`,
  AccomplishmentReport: (id) => `/reports/${id}`,
};

function parentRevalidatePath(entityType: string, entityId: string, organizationId: string): string {
  if (entityType === "Recognition") return `/organizations/${organizationId}/accreditation`;
  return OTHER_PARENT_PATHS[entityType]?.(entityId) ?? "/";
}

/** The requirement-scoped upload page, when the file is a tagged checklist doc. */
function requirementRevalidatePath(organizationId: string, kind: string | null): string | null {
  if (!kind) return null;
  return `/organizations/${organizationId}/accreditation/requirements/${kind}`;
}

export async function uploadAttachment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requirePermissionOrThrow("activity.submit");
  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const file = formData.get("file");

  if (!isAttachableEntity(entityType)) {
    return { error: "Attachments are not supported for this record." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  const parent = await loadAttachableParent(entityType, entityId);
  if (!parent) return { error: "The record no longer exists." };
  if (!canManageAttachments(user, parent)) {
    return { error: "You cannot attach files to this record." };
  }

  const invalid = validateFile(file.type, file.size);
  if (invalid) return { error: invalid };

  // Requirement tagging only applies to recognition requirements; other
  // parents (activities, reports) ignore the field entirely.
  let kind: AttachmentKind | null = null;
  if (entityType === "Recognition") {
    const rawKind = String(formData.get("kind") ?? "");
    if (rawKind && !isAttachmentKind(rawKind)) {
      return { error: "Choose a valid requirement for this file." };
    }
    kind = isAttachmentKind(rawKind) ? rawKind : null;
  }

  // Re-check the size against the actual bytes, not just the header.
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) {
    return { error: "Files may not exceed 10 MB." };
  }

  const storedName = newStoredName(file.type);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500) || null;
  try {
    await saveAttachmentFile(storedName, bytes);
    await db.attachment.create({
      data: {
        entityType,
        entityId,
        fileName: file.name.slice(0, 255),
        notes,
        storedName,
        mimeType: file.type,
        sizeBytes: bytes.length,
        kind,
        uploadedById: user.id,
      },
    });
  } catch {
    await deleteAttachmentFile(storedName);
    return { error: "Could not save the file. Try again." };
  }

  await writeAudit({
    userId: user.id,
    action: "ATTACHMENT_UPLOADED",
    entityType,
    entityId,
    entityLabel: file.name,
    newState: { mimeType: file.type, sizeBytes: bytes.length, kind },
  });

  revalidatePath(parentRevalidatePath(entityType, entityId, parent.organizationId));
  revalidatePath(`/organizations/${parent.organizationId}/documents`);
  const reqPath = requirementRevalidatePath(parent.organizationId, kind);
  if (reqPath) revalidatePath(reqPath);
  return { success: `Uploaded \u201c${file.name}\u201d.` };
}

export async function deleteAttachment(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) return;
  if (!ATTACHABLE_ENTITIES.includes(attachment.entityType as never)) return;

  const parent = await loadAttachableParent(attachment.entityType, attachment.entityId);
  if (!parent) return;
  if (!canDeleteAttachment(user, attachment.uploadedById, parent)) return;

  await db.attachment.delete({ where: { id } });
  await deleteAttachmentFile(attachment.storedName);

  await writeAudit({
    userId: user.id,
    action: "ATTACHMENT_DELETED",
    entityType: attachment.entityType,
    entityId: attachment.entityId,
    entityLabel: attachment.fileName,
    previousState: { storedName: attachment.storedName },
  });

  revalidatePath(parentRevalidatePath(attachment.entityType, attachment.entityId, parent.organizationId));
  revalidatePath(`/organizations/${parent.organizationId}/documents`);
  const reqPath = requirementRevalidatePath(parent.organizationId, attachment.kind);
  if (reqPath) revalidatePath(reqPath);
}

/** Re-tag an existing file against one of the SF-001 requirements. */
export async function updateAttachmentKind(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment || !ATTACHABLE_ENTITIES.includes(attachment.entityType as never)) return;

  const parent = await loadAttachableParent(attachment.entityType, attachment.entityId);
  if (!parent) return;
  if (!canManageAttachments(user, parent)) return;

  const rawKind = String(formData.get("kind") ?? "");
  const kind: AttachmentKind | null = isAttachmentKind(rawKind) ? rawKind : null;
  // Only recognition attachments carry requirement tags.
  const nextKind = attachment.entityType === "Recognition" ? kind : null;
  if (nextKind === attachment.kind) return;

  await db.attachment.update({ where: { id }, data: { kind: nextKind } });

  await writeAudit({
    userId: user.id,
    action: "ATTACHMENT_RETAGGED",
    entityType: attachment.entityType,
    entityId: attachment.entityId,
    entityLabel: attachment.fileName,
    previousState: { kind: attachment.kind },
    newState: { kind: nextKind },
  });

  revalidatePath(parentRevalidatePath(attachment.entityType, attachment.entityId, parent.organizationId));
  revalidatePath(`/organizations/${parent.organizationId}/documents`);
  const reqPath = requirementRevalidatePath(parent.organizationId, nextKind);
  if (reqPath) revalidatePath(reqPath);
}
