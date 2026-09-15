"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { isOfficerOf } from "@/lib/forms-access";
import {
  cleanDraftData,
  loadFormDraft,
  type FormDraftData,
} from "@/lib/form-draft";
import { writeAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Form draft actions — save overrides and submit the document into the
// signature workflow. Backend-enforced: only an officer of the target org (or
// a manager) may edit/submit, and only while the document is still a draft
// (no step signed, no submission started).
// ---------------------------------------------------------------------------

export type FormDraftActionState = { error?: string; ok?: string };

/** True when the current user may govern the target organization's forms. */
export async function canGovernForms(userId: string, organizationId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return false;
  if (can({ role: user.role }, "org.manage")) return true;
  return isOfficerOf(userId, organizationId);
}

/** The SF route must still be a draft: it must not exist, or must have no
 * signed steps and no CURRENT step (i.e. not yet submitted). */
export async function routeIsEditableDraft(entityType: string, entityId: string): Promise<boolean> {
  const route = await db.signatureRoute.findUnique({
    where: { entityType_entityId: { entityType, entityId } },
    include: { steps: true },
  });
  if (!route) return true; // not yet routed = still a draft
  if (route.state === "RETURNED_FOR_REVISION") return true; // revision reopens drafting
  if (route.state === "COMPLETED" || route.state === "REJECTED") return false;
  const hasCurrent = route.steps.some((s) => s.status === "CURRENT");
  const hasSigned = route.steps.some((s) => s.status === "SIGNED");
  return !hasCurrent && !hasSigned;
}

async function ensureOfficer(
  userId: string,
  organizationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await canGovernForms(userId, organizationId)) return { ok: true };
  return {
    ok: false,
    error: "Only an authorized officer of the organization (or an administrator) can edit or submit its official forms.",
  };
}

/** Save unsent field overrides without starting the workflow. */
export async function saveFormDraft(
  _prev: FormDraftActionState,
  formData: FormData
): Promise<FormDraftActionState> {
  try {
    const user = await requireUser();
    const formKey = String(formData.get("formKey") ?? "");
    const organizationId = String(formData.get("organizationId") ?? "");
    const academicYear = String(formData.get("academicYear") ?? "");
    if (!formKey || !organizationId || !academicYear) return { error: "Missing form context." };

    const guard = await ensureOfficer(user.id, organizationId);
    if (!guard.ok) return { error: guard.error };

    const entityType = "SF";
    const entityId = `${formKey}:${organizationId}:${academicYear}`;
    if (!(await routeIsEditableDraft(entityType, entityId))) {
      return { error: "This document has already been submitted and can no longer be edited." };
    }

    // Read only the known draft fields from the submitted form.
    const raw: Record<string, unknown> = {};
    for (const key of DRAFT_KEYS_FROM_FORM) {
      const v = formData.get(key);
      if (typeof v === "string") raw[key] = v;
    }
    const data = cleanDraftData(raw);

    const existing = await db.formDocument.findUnique({
      where: {
        formKey_organizationId_academicYear: { formKey, organizationId, academicYear },
      },
    });

    const doc = await db.$transaction(async (tx) => {
      if (existing) {
        const same =
          JSON.stringify(existing.data) === JSON.stringify(data) &&
          existing.submittedAt === null;
        if (same) return { ...existing, data, unchanged: true as const };
        const nextVersion = existing.version + 1;
        await tx.formDocumentVersion.create({
          data: {
            formDocumentId: existing.id,
            version: nextVersion,
            action: "DRAFT_SAVED",
            note: "Draft saved",
            data,
            actorId: user.id,
          },
        });
        return tx.formDocument.update({
          where: { id: existing.id },
          data: { data, version: nextVersion, submittedAt: null },
        }) as Promise<{ id: string; version: number; submittedAt: Date | null; unchanged?: false }>;
      }
      const created = await tx.formDocument.create({
        data: {
          formKey,
          organizationId,
          academicYear,
          data,
          version: 1,
          versions: {
            create: {
              version: 1,
              action: "DRAFT_SAVED",
              note: "Initial draft",
              data,
              actorId: user.id,
            },
          },
        },
      });
      return { ...created, unchanged: false as const };
    });

    await writeAudit({
      userId: user.id,
      action: "FORM.DRAFT_SAVED",
      entityType: "SF",
      entityId,
      entityLabel: `${formKey} · ${organizationId} · ${academicYear}`,
      newState: { organizationId, academicYear, version: doc.version },
    });

    revalidatePath(`/forms/${formKey.toLowerCase()}`);
    return { ok: `Draft saved${(doc as { unchanged?: boolean }).unchanged ? " (no changes)" : ""}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save draft." };
  }
}

/**
 * Submit the document: activates the first workflow step so signatures are
 * accepted, records submission, and snapshots a SUBMITTED version. Only valid
 * while the document is still an un-submitted draft.
 */
export async function submitFormDocument(
  _prev: FormDraftActionState,
  formData: FormData
): Promise<FormDraftActionState> {
  try {
    const user = await requireUser();
    const formKey = String(formData.get("formKey") ?? "");
    const organizationId = String(formData.get("organizationId") ?? "");
    const academicYear = String(formData.get("academicYear") ?? "");
    if (!formKey || !organizationId || !academicYear) return { error: "Missing form context." };

    const guard = await ensureOfficer(user.id, organizationId);
    if (!guard.ok) return { error: guard.error };

    const entityType = "SF";
    const entityId = `${formKey}:${organizationId}:${academicYear}`;
    if (!(await routeIsEditableDraft(entityType, entityId))) {
      return { error: "This document has already been submitted." };
    }

    // Create the route if it doesn't exist yet (all steps LOCKED), then
    // activate the first step.
    const { ensureRoute, getRouteWithSteps } = await import("@/lib/signature-routing");
    const route =
      (await getRouteWithSteps(entityType, entityId)) ??
      (await ensureRoute({
        entityType,
        entityId,
        formKey,
        title: formKey,
        creatorId: user.id,
        activateFirst: false,
      }));

    await db.$transaction(async (tx) => {
      await tx.signatureRoute.update({
        where: { id: route.id },
        data: { state: "IN_PROGRESS" },
      });
      const first = await tx.signatureStep.findFirst({
        where: { routeId: route.id, order: 1 },
      });
      if (first) {
        await tx.signatureStep.update({
          where: { id: first.id },
          data: { status: "CURRENT" },
        });
      }
    });

    const { notifyRouteSigners } = await import("@/lib/notifications");
    await notifyRouteSigners(route.id, {
      type: "SIGNATURE_REQUESTED",
      category: "SIGNATURE",
      priority: "ACTION_REQUIRED",
      title: `Signature required: ${formKey}`,
      body: "A document was submitted and your signature is the first step in the chain.",
      dedupKey: `SUBMITTED:${route.id}:${route.version}`,
      reason: "You hold the current signatory role for this submitted document.",
    });

    // Record submission + a SUBMITTED version snapshot.
    const current = await loadFormDraft(formKey, organizationId, academicYear);
    const data = (current?.data ?? {}) as FormDraftData;
    const existing = await db.formDocument.findUnique({
      where: {
        formKey_organizationId_academicYear: { formKey, organizationId, academicYear },
      },
    });
    if (existing) {
      await db.$transaction(async (tx) => {
        await tx.formDocument.update({
          where: { id: existing.id },
          data: { submittedAt: new Date(), version: existing.version + 1 },
        });
        await tx.formDocumentVersion.create({
          data: {
            formDocumentId: existing.id,
            version: existing.version + 1,
            action: "SUBMITTED",
            note: "Submitted for signatures",
            data,
            actorId: user.id,
          },
        });
      });
    } else {
      await db.formDocument.create({
        data: {
          formKey,
          organizationId,
          academicYear,
          data,
          version: 1,
          submittedAt: new Date(),
          versions: {
            create: {
              version: 1,
              action: "SUBMITTED",
              note: "Submitted for signatures",
              data,
              actorId: user.id,
            },
          },
        },
      });
    }

    await writeAudit({
      userId: user.id,
      action: "FORM.SUBMITTED",
      entityType: "SF",
      entityId,
      entityLabel: `${formKey} · ${organizationId} · ${academicYear}`,
      newState: { organizationId, academicYear, documentVersion: (existing?.version ?? 0) + 1 },
    });

    revalidatePath(`/forms/${formKey.toLowerCase()}`);
    return { ok: "Document submitted for signatures." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to submit document." };
  }
}

const DRAFT_KEYS_FROM_FORM = [
  "orgName",
  "date",
  "ay",
  "semester",
  "presidentName",
  "secretaryName",
  "deanName",
  "adviserName",
  "adviserInfoName",
  "adviserInfoCollege",
  "certifiedStudentName",
  "certifiedStudentCourseYearSection",
] as const;
