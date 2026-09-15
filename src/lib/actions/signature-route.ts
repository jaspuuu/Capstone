"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import {
  ensureRoute,
  getRouteWithSteps,
  resolveSigners,
} from "@/lib/signature-routing";
import {
  authorizeStepForUser,
  resolveOrgContext,
  SIGNATORY_SCOPE,
} from "@/lib/signature-policy";
import { writeAudit } from "@/lib/audit";
import {
  canonicalJsonHash,
  hashChainStep,
  signatureContentHash,
  signatureContentPayload,
} from "@/lib/signature-integrity";
import { syncFinancialSubmission } from "@/lib/actions/financial";
import { notifyOrgOfficers, notifyRouteSigners } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Signing actions (§10 explicit confirmation, §11 audit trail, §28 backend
// enforcement). Every action re-derives the target organization from the
// routed RECORD and re-runs the centralized policy — an attacker altering the
// URL, the route id, or any request field cannot widen authorization.
// ---------------------------------------------------------------------------

export type RouteActionState = { error?: string; ok?: string };

async function signerName(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  return u ? `${u.firstName} ${u.lastName}` : null;
}

export async function signCurrentStep(
  _prev: RouteActionState,
  formData: FormData
): Promise<RouteActionState> {
  try {
    const user = await requireUser();
    const routeId = String(formData.get("routeId") ?? "");
    if (formData.get("confirm") !== "yes") {
      return { error: "You must explicitly confirm attaching your digital signature." };
    }
    // A signature is never attached implicitly: the signatory must separately
    // confirm they reviewed the document AND opted into attaching their saved
    // signature. Both are enforced server-side, not just in the UI.
    if (formData.get("confirmReview") !== "yes") {
      return { error: "You must confirm that you reviewed this document before signing." };
    }
    if (formData.get("useSavedSignature") !== "true") {
      return { error: "You must opt into attaching your saved signature to this document." };
    }

    const route = await db.signatureRoute.findUnique({
      where: { id: routeId },
      select: { id: true, entityType: true, entityId: true, formKey: true, title: true, version: true },
    });
    if (!route) return { error: "Routing record not found." };

    // Centralized policy gate — organization is derived from the RECORD.
    const { step, org } = await authorizeStepForUser({
      entityType: route.entityType,
      entityId: route.entityId,
      userId: user.id,
    });

    // Snapshot the signature from the live User row (never trust stale session data).
    const signer = await db.user.findUnique({
      where: { id: user.id },
      select: { signatureImage: true, signatureTyped: true, signatureMethod: true },
    });
    if (!signer?.signatureImage && !signer?.signatureTyped) {
      return { error: "Save a signature in My Signature first — signatures are never attached automatically." };
    }

    const signedAt = new Date();
    const contentHash = signatureContentHash(
      signatureContentPayload({
        entityType: route.entityType,
        entityId: route.entityId,
        formKey: route.formKey,
        title: route.title,
        version: route.version,
        orgId: org.id,
        academicYear: org.academicYear,
      })
    );

    // Canonical snapshot of the resolved document data at the moment of
    // signing (SF routes). A later edit to the same FormDocument.data is
    // detected at export because the stored hash won't match.
    let documentDataHash: string | null = null;
    if (route.entityType === "SF") {
      const doc = await db.formDocument.findUnique({
        where: { formKey_organizationId_academicYear: { formKey: route.formKey, organizationId: org.id, academicYear: org.academicYear } },
        select: { data: true },
      });
      if (doc) documentDataHash = canonicalJsonHash(doc.data);
    }

    let nextInChain: { id: string; role: string } | null = null;

    await db.$transaction(async (tx) => {
      // Previous link in the chain (the most recent signed step, if any).
      const prev = await tx.signatureStep.findFirst({
        where: { routeId: route.id, order: { lt: step.order }, status: "SIGNED" },
        orderBy: { order: "desc" },
        select: { chainHash: true },
      });
      const chainHash = hashChainStep({
        role: step.role,
        signerId: user.id,
        signedAt,
        method: signer.signatureMethod,
        contentHash,
        prevChainHash: prev?.chainHash ?? null,
      });

await tx.signatureStep.update({
        where: { id: step.id },
        data: {
          status: "SIGNED",
          signerId: user.id,
          actedById: user.id,
          signedAt,
          signatureImage: signer.signatureImage,
          signatureTyped: signer.signatureTyped,
          signatureMethod: signer.signatureMethod,
          contentHash,
          prevChainHash: prev?.chainHash ?? null,
          chainHash,
          documentDataHash,
        },
      });

      const next = await tx.signatureStep.findFirst({
        where: { routeId: route.id, order: { gt: step.order }, status: "LOCKED" },
        orderBy: { order: "asc" },
      });
      if (next) {
        nextInChain = next;
        const eligible = await resolveSigners(next.role, org);
        await tx.signatureStep.update({
          where: { id: next.id },
          data: {
            status: "CURRENT",
            signerId: eligible.length === 1 ? eligible[0] : null,
          },
        });
      } else {
await tx.signatureRoute.update({
          where: { id: route.id },
          data: { state: "COMPLETED" },
        });
      }
    });

    if (nextInChain) {
      await notifyRouteSigners(route.id, {
        type: "SIGNATURE_REQUESTED",
        category: "SIGNATURE",
        priority: "ACTION_REQUIRED",
        title: `Signature required: ${route.title ?? route.formKey}`,
        body: "The signing chain advanced after your review; a new step now requires your signature.",
        reason: "You hold the current signatory role for this document. Signing is required to continue the workflow.",
      });
    } else {
      await notifyOrgOfficers(org.id, {
        type: "SIGNATURE_COMPLETED",
        category: "APPROVAL",
        priority: "SUCCESS",
        title: `All signatures collected: ${route.title ?? route.formKey}`,
        body: "Every required signatory has approved the document.",
        entityType: route.entityType,
        entityId: route.entityId,
        dedupKey: `SIGNED:${route.id}:${route.version}:COMPLETED`,
        link: `/forms/${route.formKey.toLowerCase()}`,
        reason: "This document belongs to your organization and has been fully approved.",
      }, { academicYear: org.academicYear });
    }

    await syncFinancialSubmission({ entityType: route.entityType, entityId: route.entityId });
    await writeAudit({
      userId: user.id,
      action: "SIGNATURE.SIGNED",
      entityType: route.entityType,
      entityId: route.entityId,
      entityLabel: `${route.title ?? route.formKey} · ${route.formKey}`,
      newState: {
        organizationId: org.id,
        academicYear: org.academicYear,
        signerName: await signerName(user.id),
        role: step.role,
        signatoryScope: SIGNATORY_SCOPE[step.role],
        documentVersion: route.version,
        workflowStep: step.order,
        signatureMethod: signer.signatureMethod ?? null,
        action: "Approved & Signed",
        signedAt: signedAt.toISOString(),
      },
    });
    revalidatePath(`/forms/${route.formKey.toLowerCase()}`);
    return { ok: "Signature attached and forwarded." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Signing failed." };
  }
}

export async function returnCurrentStep(
  _prev: RouteActionState,
  formData: FormData
): Promise<RouteActionState> {
  try {
    const user = await requireUser();
    const routeId = String(formData.get("routeId") ?? "");
    const comment = String(formData.get("comment") ?? "").trim() || null;

    const route = await db.signatureRoute.findUnique({
      where: { id: routeId },
      select: { id: true, entityType: true, entityId: true, formKey: true, title: true, version: true },
    });
    if (!route) return { error: "Routing record not found." };

    const { step, org } = await authorizeStepForUser({
      entityType: route.entityType,
      entityId: route.entityId,
      userId: user.id,
    });

    await db.$transaction(async (tx) => {
      await tx.signatureStep.update({
        where: { id: step.id },
        data: {
          status: "RETURNED",
          actedById: user.id,
          comment: comment ? `Returned by ${user.firstName} ${user.lastName}: ${comment}` : `Returned by ${user.firstName} ${user.lastName}.`,
        },
      });
      await tx.signatureRoute.update({
        where: { id: route.id },
        data: { state: "RETURNED_FOR_REVISION", version: { increment: 1 } },
      });
      // Back to the originator (first step) for revision.
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

    await notifyRouteSigners(route.id, {
      type: "SIGNATURE_RETURNED",
      category: "REVISION",
      priority: "ACTION_REQUIRED",
      title: `Document returned for revision: ${route.title ?? route.formKey}`,
      body: comment ? `Reason: ${comment.slice(0, 200)}` : "A signatory returned the document with a comment.",
      dedupKey: `RETURNED:${route.id}:${route.version + 1}`,
      reason: "A signatory returned this document; it must be corrected and re-signed before the workflow can continue.",
    });

    await syncFinancialSubmission({ entityType: route.entityType, entityId: route.entityId });
    await writeAudit({
      userId: user.id,
      action: "SIGNATURE.RETURNED",
      entityType: route.entityType,
      entityId: route.entityId,
      entityLabel: `${route.title ?? route.formKey} · ${route.formKey}`,
      newState: {
        organizationId: org.id,
        academicYear: org.academicYear,
        signerName: await signerName(user.id),
        role: step.role,
        documentVersion: route.version + 1,
        workflowStep: step.order,
        action: "Returned for revision",
        comment,
      },
    });
    revalidatePath(`/forms/${route.formKey.toLowerCase()}`);
    return { ok: "Document returned for revision." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Return failed." };
  }
}

/** Originator resubmits after a revision: clears prior actions, restarts flow. */
export async function resubmitRoute(
  _prev: RouteActionState,
  formData: FormData
): Promise<RouteActionState> {
  try {
    const user = await requireUser();
    const routeId = String(formData.get("routeId") ?? "");
    const route = await db.signatureRoute.findUnique({
      where: { id: routeId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!route) return { error: "Routing record not found." };

    const org = await resolveOrgContext(route.entityType, route.entityId);
    const first = route.steps[0];
    const eligible = await resolveSigners(first.role, org);
    if (!eligible.includes(user.id)) {
      return { error: "Only the originating officer can resubmit this document." };
    }
    if (route.state !== "RETURNED_FOR_REVISION") {
      return { error: "This document is not awaiting revision." };
    }

    await resetRouteForResubmit(route.id);
    await notifyRouteSigners(route.id, {
      type: "SIGNATURE_RESUBMITTED",
      category: "SIGNATURE",
      priority: "ACTION_REQUIRED",
      title: `Re-signed document: ${route.title ?? route.formKey}`,
      body: "The document was resubmitted after revision; please re-verify and sign before the next step.",
      dedupKey: `RESUBMITTED:${route.id}:${route.version}`,
      reason: "The document was corrected and resubmitted; the signing chain restarts at your step.",
    });
    await writeAudit({
      userId: user.id,
      action: "SIGNATURE.RESUBMITTED",
      entityType: route.entityType,
      entityId: route.entityId,
      entityLabel: `${route.title ?? route.formKey} · ${route.formKey}`,
      newState: {
        organizationId: org.id,
        academicYear: org.academicYear,
        signerName: await signerName(user.id),
        role: first.role,
        documentVersion: route.version,
        workflowStep: 1,
        action: "Resubmitted for signatures",
      },
    });

    await syncFinancialSubmission({ entityType: route.entityType, entityId: route.entityId });
    revalidatePath(`/forms/${route.formKey.toLowerCase()}`);
    return { ok: "Document resubmitted for signatures." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Resubmit failed." };
  }
}

/**
 * Shared reset for the originator after a return: marks the flow IN_PROGRESS
 * and clears every step so signers re-verify the revised document. Shared by
 * printed forms and the financial compliance module.
 */
export async function resetRouteForResubmit(routeId: string) {
  await db.$transaction(async (tx) => {
    await tx.signatureRoute.update({
      where: { id: routeId },
      data: { state: "IN_PROGRESS" },
    });
    // Fresh start: clear every step (version was already bumped on return).
    await tx.signatureStep.updateMany({
      where: { routeId },
      data: {
        status: "LOCKED",
        signedAt: null,
        signatureImage: null,
        signatureTyped: null,
        signatureMethod: null,
        comment: null,
        actedById: null,
        contentHash: null,
        prevChainHash: null,
        chainHash: null,
        documentDataHash: null,
      },
    });
    const newFirst = await tx.signatureStep.findFirst({
      where: { routeId, order: 1 },
    });
    if (newFirst) {
      await tx.signatureStep.update({
        where: { id: newFirst.id },
        data: { status: "CURRENT" },
      });
    }
  });
}

/** Loads (and lazily creates) the route so pages can render the tracker. */
export async function loadOrCreateRoute(params: {
  entityType: string;
  entityId: string;
  formKey: string;
  title?: string;
}) {
  const existing = await getRouteWithSteps(params.entityType, params.entityId);
  if (existing) return existing;
  const user = await requireUser();
  return ensureRoute({ ...params, creatorId: user.id, activateFirst: false });
}

