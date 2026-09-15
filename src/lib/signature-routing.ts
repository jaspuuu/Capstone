import "server-only";
import { db } from "@/lib/db";
import { sfRouteEntityId } from "@/lib/form-routes";
import {
  authorizeStepForUser,
  canUserSign,
  describeSignatureStatus,
  resolveOrgContext,
  resolveSigners,
  type SignatureStatusDetail,
} from "@/lib/signature-policy";

// ---------------------------------------------------------------------------
// Signature routing core (§9 strict sequencing). Authority is delegated to the
// centralized signature-policy module — every helper here re-derives from the
// database, and the target organization always comes from the routed record
// itself. Client input can never select who signs or which org is targeted.
// ---------------------------------------------------------------------------

export { resolveSigners, resolveOrgContext, canUserSign, describeSignatureStatus };
export type { SignatureStatusDetail };

export async function getRouteWithSteps(entityType: string, entityId: string) {
  return db.signatureRoute.findUnique({
    where: { entityType_entityId: { entityType, entityId } },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: {
          signer: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });
}

/**
 * Roles that have actually SIGNED the given SF form instance (formKey + org
 * + AY), read from the routed workflow. A signature must only ever be rendered
 * on the printed document when this confirms the step was explicitly signed.
 * Returns an empty set when no route exists yet.
 */
export async function getSignedRolesForSf(formKey: string, orgId: string, ay: string) {
  const route = await getRouteWithSteps("SF", sfRouteEntityId(formKey, orgId, ay));
  const signed = new Set<string>();
  if (route) {
    for (const s of route.steps) {
      if (s.status === "SIGNED" && s.signerId) signed.add(s.role);
    }
  }
  return signed;
}

/**
 * Lazily creates the route for a form instance using its configured sequence.
 * By default the first step is set CURRENT immediately (used by inline/direct
 * routing). Pass `activateFirst: false` to create the route "locked" (all
 * steps LOCKED) so nothing is signable until the document is submitted — this
 * is how official SF drafts begin (see `submitFormDocument`).
 */
export async function ensureRoute(params: {
  entityType: string;
  entityId: string;
  formKey: string;
  title?: string;
  creatorId: string;
  activateFirst?: boolean;
}) {
  const existing = await getRouteWithSteps(params.entityType, params.entityId);
  if (existing) return existing;

  const { formRoute } = await import("@/lib/form-routes");
  const roles = formRoute(params.formKey);
  if (roles.length === 0) throw new Error(`No signatory sequence configured for ${params.formKey}`);

  return db.signatureRoute.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      formKey: params.formKey,
      title: params.title,
      createdById: params.creatorId,
      steps: {
        create: roles.map((role, i) => ({
          order: i + 1,
          role,
          status:
            i === 0 && params.activateFirst !== false ? ("CURRENT" as const) : ("LOCKED" as const),
        })),
      },
    },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: { signer: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
}

/**
 * Backend enforcement for §9/§28 — single source of truth is the policy
 * module. The target organization is ALWAYS derived from the routed record,
 * so a caller-supplied org or URL switch can never widen the check. Returns
 * the CURRENT step when `userId` is the database-derived signatory for that
 * step's role in the document's organization; throws otherwise.
 */
export async function authorizeCurrentSigner(params: {
  entityType: string;
  entityId: string;
  userId: string;
}) {
  return authorizeStepForUser(params);
}