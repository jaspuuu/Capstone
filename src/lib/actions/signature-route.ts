"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import {
  authorizeCurrentSigner,
  ensureRoute,
  getRouteWithSteps,
  resolveSigners,
} from "@/lib/signature-routing";
import {
  hashChainStep,
  signatureContentHash,
  signatureContentPayload,
} from "@/lib/signature-integrity";

// ---------------------------------------------------------------------------
// Signing actions (§10 explicit confirmation, §11 audit trail, §28 backend
// enforcement). The `confirm` flag must arrive as "yes" — a saved signature
// is never attached implicitly.
// ---------------------------------------------------------------------------

export type RouteActionState = { error?: string; ok?: string };

async function orgContextFor(entityId: string) {
  // entityId = `${formKey}:${orgId}:${ay}`
  const [, orgId, ay] = entityId.split(":");
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, collegeId: true },
  });
  if (!org) throw new Error("Organization not found.");
  return { ...org, academicYear: ay };
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

const route = await db.signatureRoute.findUnique({
      where: { id: routeId },
      select: { id: true, entityType: true, entityId: true, formKey: true, title: true, version: true },
    });
    if (!route) return { error: "Routing record not found." };

    const org = await orgContextFor(route.entityId);
    const { step } = await authorizeCurrentSigner({
      entityType: route.entityType,
      entityId: route.entityId,
      userId: user.id,
      org,
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
        },
      });

      const next = await tx.signatureStep.findFirst({
        where: { routeId: route.id, order: { gt: step.order }, status: "LOCKED" },
        orderBy: { order: "asc" },
      });
      if (next) {
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
      select: { id: true, entityType: true, entityId: true, formKey: true },
    });
    if (!route) return { error: "Routing record not found." };

    const org = await orgContextFor(route.entityId);
    const { step } = await authorizeCurrentSigner({
      entityType: route.entityType,
      entityId: route.entityId,
      userId: user.id,
      org,
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

    const org = await orgContextFor(route.entityId);
    const first = route.steps[0];
    const eligible = await resolveSigners(first.role, org);
    if (!eligible.includes(user.id)) {
      return { error: "Only the originating officer can resubmit this document." };
    }
    if (route.state !== "RETURNED_FOR_REVISION") {
      return { error: "This document is not awaiting revision." };
    }

    await db.$transaction(async (tx) => {
      await tx.signatureRoute.update({
        where: { id: route.id },
        data: { state: "IN_PROGRESS" },
      });
// Fresh start: clear every step (version was already bumped on return).
      await tx.signatureStep.updateMany({
        where: { routeId: route.id },
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
        },
      });
      const newFirst = await tx.signatureStep.findFirst({
        where: { routeId: route.id, order: 1 },
      });
      if (newFirst) {
        await tx.signatureStep.update({
          where: { id: newFirst.id },
          data: { status: "CURRENT" },
        });
      }
    });

    revalidatePath(`/forms/${route.formKey.toLowerCase()}`);
    return { ok: "Document resubmitted for signatures." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Resubmit failed." };
  }
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
  return ensureRoute({ ...params, creatorId: user.id });
}

