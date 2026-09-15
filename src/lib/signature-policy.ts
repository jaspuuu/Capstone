import { db } from "./db";
import type {
  Prisma,
  SignatoryRole,
  SignatureStepStatus,
  RouteState,
} from "@/generated/prisma/client";
import { SIGNATORY_LABELS } from "./form-routes";

// ---------------------------------------------------------------------------
// CENTRALIZED SIGNATURE AUTHORIZATION POLICY (single source of truth).
//
// Every signature decision in the system goes through this module — the same
// predicate powers the optimistic UI preview, the server actions, and the
// lazily-created routes. Authorization is ALWAYS derived from the routed
// record (entityType + entityId), never from anything a caller or the URL
// supplies, so frontend manipulation, IDOR, and cross-organization signing
// cannot bypass it.
//
// The model per document step:
//   user -> database-resolved officer/adviser/office assignment
//        -> target organization (derived from the record)
//        -> required signatory role (workflow configuration)
//        -> current workflow state (only the CURRENT step is signable)
//        -> authorization
// ---------------------------------------------------------------------------

export type OrgContext = { id: string; collegeId: string; academicYear: string };

/** Signatory scope per role. ORGANIZATION = the user must hold the matching
 * assignment in the document's organization. INSTITUTION = office-wide (the
 * college dean for that org's college; any authorized SOA/OSAS officer). */
export const SIGNATORY_SCOPE: Record<SignatoryRole, "ORGANIZATION" | "INSTITUTION"> = {
  PRESIDENT: "ORGANIZATION",
  SECRETARY: "ORGANIZATION",
  SENIOR_ADVISER: "ORGANIZATION",
  JUNIOR_ADVISER: "ORGANIZATION",
  DEAN: "INSTITUTION",
  SOA: "INSTITUTION",
  OSAS: "INSTITUTION",
};

export type SignatureDenialCode =
  | "NOT_ROUTED"
  | "COMPLETED"
  | "REJECTED"
  | "NO_AWAITED_SIGNATORY"
  | "NOT_YOUR_STEP"
  | "NOT_FOUND";

/** Safe, human-readable denial. Codes keep the UI able to explain WHY without
 * leaking internals to the requesting user. */
export class SignatureDeniedError extends Error {
  code: SignatureDenialCode;
  constructor(code: SignatureDenialCode, message: string) {
    super(message);
    this.name = "SignatureDeniedError";
    this.code = code;
  }
}

const routeInclude = {
  steps: {
    orderBy: { order: "asc" as const },
    include: { signer: { select: { id: true, firstName: true, lastName: true } } },
  },
} satisfies Prisma.SignatureRouteInclude;

export type RoutedDocument = Prisma.SignatureRouteGetPayload<{ include: typeof routeInclude }>;

/** Load the routing record (does NOT create one). */
export async function loadRoute(entityType: string, entityId: string): Promise<RoutedDocument | null> {
  return db.signatureRoute.findUnique({
    where: { entityType_entityId: { entityType, entityId } },
    include: routeInclude,
  });
}

/** DERIVE the target organization from the routed record itself. Nothing a
 * caller passes in can substitute for this — the record is the authority. */
export async function resolveOrgContext(entityType: string, entityId: string): Promise<OrgContext> {
  if (entityType === "FinancialSubmission") {
    const sub = await db.financialSubmission.findUnique({
      where: { id: entityId },
      select: { organizationId: true, academicYear: true },
    });
    if (!sub) throw new SignatureDeniedError("NOT_FOUND", "Financial submission not found.");
    const org = await db.organization.findUnique({
      where: { id: sub.organizationId },
      select: { id: true, collegeId: true },
    });
    if (!org) throw new SignatureDeniedError("NOT_FOUND", "Organization not found.");
    return { id: org.id, collegeId: org.collegeId, academicYear: sub.academicYear };
  }

  // SF form routes are keyed `${formKey}:${orgId}:${ay}`.
  const parts = entityId.split(":");
  const orgId = parts[1];
  const ay = parts[2];
  if (orgId === undefined || ay === undefined)
    throw new SignatureDeniedError("NOT_FOUND", "Unknown document reference.");
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, collegeId: true },
  });
  if (!org) throw new SignatureDeniedError("NOT_FOUND", "Organization not found.");
  return { id: org.id, collegeId: org.collegeId, academicYear: ay };
}

/**
 * Resolve the concrete user(s) ALLOWED to act on a signatory slot, straight
 * from relationship data — never from roles alone. An organization-scoped role
 * is only satisfiable by the matching assignment in THIS org:
 *   PRESIDENT/SECRETARY -> the org's current officer rows for this AY
 *   SENIOR/JUNIOR_ADVISER -> the org's current adviser assignment (type-aware)
 * Institution-scoped slots use the record's own college/office:
 *   DEAN -> the dean of the org's college only
 *   SOA/OSAS -> any active authorized office account
 */
export async function resolveSigners(role: SignatoryRole, org: OrgContext): Promise<string[]> {
  switch (role) {
    case "PRESIDENT":
    case "SECRETARY": {
      const rows = await db.organizationMember.findMany({
        where: {
          organizationId: org.id,
          position: role,
          isCurrent: true,
          status: { in: ["APPROVED", "ACTIVE"] },
          academicYear: org.academicYear,
          user: { isActive: true },
        },
        select: { userId: true },
      });
      return rows.map((r) => r.userId);
    }
    case "SENIOR_ADVISER":
    case "JUNIOR_ADVISER": {
      const rows = await db.adviserAssignment.findMany({
        where: {
          organizationId: org.id,
          type: role === "SENIOR_ADVISER" ? "REGULAR" : "PART_TIME",
          isCurrent: true,
          academicYear: org.academicYear,
          adviser: { isActive: true },
        },
        select: { adviserId: true },
      });
      return rows.map((r) => r.adviserId);
    }
    case "DEAN": {
      const college = await db.college.findUnique({
        where: { id: org.collegeId },
        select: { dean: { select: { id: true, isActive: true } } },
      });
      return college?.dean?.isActive ? [college.dean.id] : [];
    }
    case "SOA":
    case "OSAS": {
      const users = await db.user.findMany({
        where: { role, isActive: true },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }
  }
}

/**
 * THE single authorization decision for a sign/return action. Throws
 * SignatureDeniedError when the user may not act on the current step. The org
 * is derived from the record inside, and every state gate is checked here:
 * routed · not completed · not rejected · a CURRENT step exists · the user is
 * the database-resolved signatory for THIS document's organization.
 */
export async function authorizeStepForUser(params: {
  userId: string;
  entityType: string;
  entityId: string;
}): Promise<{ route: RoutedDocument; step: RoutedDocument["steps"][number]; org: OrgContext }> {
  const { userId, entityType, entityId } = params;

  const route = await loadRoute(entityType, entityId);
  if (!route) {
    throw new SignatureDeniedError(
      "NOT_ROUTED",
      "This document has not been routed for signatures yet."
    );
  }
  if (route.state === "COMPLETED") {
    throw new SignatureDeniedError(
      "COMPLETED",
      "This document is already fully signed — no further signatures are accepted."
    );
  }
  if (route.state === "REJECTED") {
    throw new SignatureDeniedError(
      "REJECTED",
      "This document was rejected and is no longer accepting signatures."
    );
  }

  // The org is derived from the RECORD, never from the caller/URL/route id.
  const org = await resolveOrgContext(entityType, entityId);

  const current = route.steps.find((s) => s.status === "CURRENT");
  if (!current) {
    throw new SignatureDeniedError(
      "NO_AWAITED_SIGNATORY",
      "No signature is currently being awaited on this document."
    );
  }

  const eligible = await resolveSigners(current.role, org);
  if (!eligible.includes(userId)) {
    const scope = SIGNATORY_SCOPE[current.role];
    const roleLabel = SIGNATORY_LABELS[current.role] ?? current.role;
    const message =
      scope === "ORGANIZATION"
        ? `This document is waiting for the authorized ${roleLabel} of the organization. You are not the authorized ${roleLabel} for this organization, so you cannot sign it.`
        : `This document is waiting for the ${roleLabel}. You are not the authorized signatory for this document.`;
    throw new SignatureDeniedError("NOT_YOUR_STEP", message);
  }

  return { route, step: current, org };
}

/** Non-throwing wrapper for the UI — the action path re-checks via
 * authorizeStepForUser, so this is only ever an optimistic preview. */
export async function canUserSign(params: {
  userId: string;
  entityType: string;
  entityId: string;
}): Promise<boolean> {
  try {
    await authorizeStepForUser(params);
    return true;
  } catch {
    return false;
  }
}

export type SignatureStatusDetail = {
  userCanSign: boolean;
  denial?: SignatureDenialCode;
  detail?: string;
  route?: RoutedDocument;
  org?: OrgContext;
  currentStep?: RoutedDocument["steps"][number];
  requiredRole?: string;
  scope?: "ORGANIZATION" | "INSTITUTION";
};

/** Full status detail for the signature eligibility UI (§13) — explains who
 * is awaited and why the current user can or cannot sign, without leaking
 * unrelated internal information. */
export async function describeSignatureStatus(params: {
  userId: string;
  entityType: string;
  entityId: string;
}): Promise<SignatureStatusDetail> {
  const { userId, entityType, entityId } = params;
  const route = await loadRoute(entityType, entityId);
  if (!route) return { userCanSign: false, denial: "NOT_ROUTED", detail: "This document has not been routed for signatures yet." };
  const org = await resolveOrgContext(entityType, entityId);
  const current = route.steps.find((s) => s.status === "CURRENT");
  const requiredRole = current ? (SIGNATORY_LABELS[current.role] ?? current.role) : undefined;
  const scope =
    route.state === "IN_PROGRESS" && current ? SIGNATORY_SCOPE[current.role] : undefined;

  try {
    await authorizeStepForUser(params);
    return { userCanSign: true, route, org, currentStep: current, requiredRole, scope };
  } catch (e) {
    const denial = e instanceof SignatureDeniedError ? e.code : undefined;
    const detail = e instanceof SignatureDeniedError ? e.message : "You are not authorized to sign this document.";
    return { userCanSign: false, denial, detail, route, org, currentStep: current, requiredRole, scope };
  }
}