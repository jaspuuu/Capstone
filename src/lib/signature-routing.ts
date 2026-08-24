import "server-only";
import { db } from "@/lib/db";
import { formRoute } from "@/lib/form-routes";

// ---------------------------------------------------------------------------
// Signature routing core (§9 strict sequencing). Every helper here re-derives
// authority from the database — client input can never select who signs.
// ---------------------------------------------------------------------------

type OrgContext = {
  id: string;
  collegeId: string;
  academicYear: string;
};

/**
 * Resolve the concrete user allowed to act on a signatory slot, straight from
 * relationship data. Office slots (DEAN/SOA/OSAS) may have several eligible
 * users, so this returns an id list.
 */
export async function resolveSigners(
  role: import("@/generated/prisma/client").SignatoryRole,
  org: OrgContext
): Promise<string[]> {
  switch (role) {
    case "PRESIDENT":
    case "SECRETARY": {
      const rows = await db.organizationMember.findMany({
        where: {
          organizationId: org.id,
          position: role,
          isCurrent: true,
          status: "APPROVED",
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

/** Lazily creates the route for a form instance using its configured sequence. */
export async function ensureRoute(params: {
  entityType: string;
  entityId: string;
  formKey: string;
  title?: string;
  creatorId: string;
}) {
  const existing = await getRouteWithSteps(params.entityType, params.entityId);
  if (existing) return existing;

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
          status: i === 0 ? ("CURRENT" as const) : ("LOCKED" as const),
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
 * Backend enforcement for §9/§28. Returns the CURRENT step when `userId` is
 * one of the database-derived eligible signers for that step's role; throws
 * otherwise. A locked/future step can never be signed through any entry point.
 */
export async function authorizeCurrentSigner(params: {
  entityType: string;
  entityId: string;
  userId: string;
  org: OrgContext;
}) {
  const route = await getRouteWithSteps(params.entityType, params.entityId);
  if (!route) throw new Error("This document has not been routed for signatures yet.");
  if (route.state === "COMPLETED") throw new Error("Every signatory has already acted on this document.");

  const current = route.steps.find((s) => s.status === "CURRENT");
  if (!current) throw new Error("No signature is currently being awaited on this document.");

  const eligible = await resolveSigners(current.role, params.org);
  if (!eligible.includes(params.userId)) {
    throw new Error(
      current.role === "PRESIDENT" || current.role === "SECRETARY"
        ? "Waiting for the organization officer in charge of this step."
        : "You are not the signatory currently awaited for this document."
    );
  }
  return { route, step: current };
}
