"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermissionOrThrow } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { currentAcademicYear } from "@/lib/utils";

export type ActionState = { error?: string; success?: string };

const orgSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters.").max(160),
  acronym: z.string().trim().max(24).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  type: z.enum(["MOTHER", "CHILD", "INDEPENDENT"]),
  parentId: z.string().optional().or(z.literal("")),
  collegeId: z.string().min(1, "Select a college."),
  departmentId: z.string().optional().or(z.literal("")),
  foundedYear: z.coerce.number().int().min(1900).max(2100).optional(),
});

function parseOrgForm(formData: FormData) {
  return orgSchema.safeParse({
    name: formData.get("name"),
    acronym: formData.get("acronym") || "",
    description: formData.get("description") || "",
    type: formData.get("type"),
    parentId: formData.get("parentId") || "",
    collegeId: formData.get("collegeId"),
    departmentId: formData.get("departmentId") || "",
    foundedYear: formData.get("foundedYear") || undefined,
  });
}

export async function createOrganization(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requirePermissionOrThrow("org.manage");

  const parsed = parseOrgForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  if (data.type === "CHILD" && !data.parentId) {
    return { error: "A sub-organization must have a mother organization." };
  }

  try {
    const org = await db.organization.create({
      data: {
        name: data.name,
        acronym: data.acronym || null,
        description: data.description || null,
        type: data.type,
        parentId: data.type === "CHILD" ? data.parentId : null,
        collegeId: data.collegeId,
        departmentId: data.departmentId || null,
        foundedYear: data.foundedYear ?? null,
      },
    });
    await writeAudit({
      userId: user.id,
      action: "ORGANIZATION_CREATED",
      entityType: "Organization",
      entityId: org.id,
      entityLabel: org.name,
      newState: { ...data },
    });
    revalidatePath("/organizations");
    redirect(`/organizations/${org.id}`);
  } catch (e) {
    if (isRedirect(e)) throw e;
    console.error(e);
    return { error: "Could not create the organization. Check the selected values and try again." };
  }
}

export async function updateOrganization(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requirePermissionOrThrow("org.manage");
  const id = String(formData.get("id") ?? "");

  const parsed = parseOrgForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const existing = await db.organization.findUnique({ where: { id } });
  if (!existing) return { error: "Organization not found." };

  if (data.type === "CHILD" && !data.parentId) {
    return { error: "A sub-organization must have a mother organization." };
  }
  if (data.parentId === id) {
    return { error: "An organization cannot be its own mother organization." };
  }

  try {
    const updated = await db.organization.update({
      where: { id },
      data: {
        name: data.name,
        acronym: data.acronym || null,
        description: data.description || null,
        type: data.type,
        parentId: data.type === "CHILD" ? data.parentId : null,
        collegeId: data.collegeId,
        departmentId: data.departmentId || null,
        foundedYear: data.foundedYear ?? null,
      },
    });
    await writeAudit({
      userId: user.id,
      action: "ORGANIZATION_UPDATED",
      entityType: "Organization",
      entityId: id,
      entityLabel: updated.name,
      previousState: existing,
      newState: data,
    });
    revalidatePath(`/organizations/${id}`);
    revalidatePath("/organizations");
    redirect(`/organizations/${id}`);
  } catch (e) {
    if (isRedirect(e)) throw e;
    console.error(e);
    return { error: "Could not update the organization." };
  }
}

export async function setOrganizationStatus(formData: FormData): Promise<void> {
  const user = await requirePermissionOrThrow("org.manage");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!["ACTIVE", "INACTIVE"].includes(status)) return;
  const existing = await db.organization.findUnique({ where: { id } });
  if (!existing) return;

  await db.organization.update({ where: { id }, data: { status: status as "ACTIVE" | "INACTIVE" } });
  await writeAudit({
    userId: user.id,
    action: status === "INACTIVE" ? "ORGANIZATION_ARCHIVED" : "ORGANIZATION_RESTORED",
    entityType: "Organization",
    entityId: id,
    entityLabel: existing.name,
    previousState: { status: existing.status },
    newState: { status },
  });
  revalidatePath(`/organizations/${id}`);
  revalidatePath("/organizations");
}

// ---------------------------------------------------------------------------
// Advisers (two distinct positions - never merged, §7)
// ---------------------------------------------------------------------------

export async function assignAdviser(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requirePermissionOrThrow("org.manage");

  const organizationId = String(formData.get("organizationId") ?? "");
  const adviserId = String(formData.get("adviserId") ?? "");
  const type = String(formData.get("type") ?? "");
  const academicYear = String(formData.get("academicYear") ?? currentAcademicYear());

  if (!organizationId || !adviserId || !["REGULAR", "PART_TIME"].includes(type)) {
    return { error: "Select an adviser and an adviser position." };
  }

  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) return { error: "Organization not found." };

  const adviser = await db.user.findUnique({ where: { id: adviserId } });
  if (!adviser || !adviser.isActive) return { error: "Selected adviser account was not found or is inactive." };
  if (adviser.role !== (type === "REGULAR" ? "ADVISER_REGULAR" : "ADVISER_PARTTIME")) {
    return {
      error:
        type === "REGULAR"
          ? "The selected account does not hold the Regular Faculty Adviser role."
          : "The selected account does not hold the Part-Time Faculty Adviser role.",
    };
  }

  const clash = await db.adviserAssignment.findFirst({
    where: { adviserId, academicYear, isCurrent: true },
  });
  if (clash) {
    return { error: `${adviser.firstName} ${adviser.lastName} already advises another organization for AY ${academicYear}.` };
  }

  try {
    await db.adviserAssignment.create({
      data: { organizationId, adviserId, type: type as "REGULAR" | "PART_TIME", academicYear },
    });
  } catch {
    return {
      error: `This organization already has a ${
        type === "REGULAR" ? "Regular Faculty Adviser" : "Part-Time Faculty Adviser"
      } for AY ${academicYear}.`,
    };
  }

  await writeAudit({
    userId: user.id,
    action: "ADVISER_ASSIGNED",
    entityType: "Organization",
    entityId: organizationId,
    entityLabel: org.name,
    newState: { adviserId, adviser: `${adviser.firstName} ${adviser.lastName}`, type, academicYear },
  });
  revalidatePath(`/organizations/${organizationId}`);
  return { success: "Adviser assigned." };
}

export async function removeAdviserAssignment(formData: FormData): Promise<void> {
  const user = await requirePermissionOrThrow("org.manage");
  const assignmentId = String(formData.get("assignmentId") ?? "");

  const assignment = await db.adviserAssignment.findUnique({
    where: { id: assignmentId },
    include: { adviser: true, organization: true },
  });
  if (!assignment) return;

  await db.adviserAssignment.delete({ where: { id: assignmentId } });
  await writeAudit({
    userId: user.id,
    action: "ADVISER_REMOVED",
    entityType: "Organization",
    entityId: assignment.organizationId,
    entityLabel: assignment.organization.name,
    previousState: {
      adviser: `${assignment.adviser.firstName} ${assignment.adviser.lastName}`,
      type: assignment.type,
      academicYear: assignment.academicYear,
    },
  });
  revalidatePath(`/organizations/${assignment.organizationId}`);
}

// ---------------------------------------------------------------------------
// Members & officers
// ---------------------------------------------------------------------------

export async function addMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermissionOrThrow("org.manage");

  const organizationId = String(formData.get("organizationId") ?? "");
  const memberId = String(formData.get("userId") ?? "");
  const position = String(formData.get("position") ?? "MEMBER");
  const academicYear = String(formData.get("academicYear") ?? currentAcademicYear());

  if (!organizationId || !memberId) return { error: "Select a student to add." };
  if (!["PRESIDENT", "SECRETARY", "MEMBER"].includes(position)) {
    return { error: "Invalid position." };
  }

  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) return { error: "Organization not found." };

  const memberUser = await db.user.findUnique({ where: { id: memberId } });
  if (!memberUser || !memberUser.isActive) return { error: "Student account not found or inactive." };

  // Keep at most one President / one Secretary per org per year.
  if (position !== "MEMBER") {
    const incumbent = await db.organizationMember.findFirst({
      where: { organizationId, position: position as "PRESIDENT" | "SECRETARY", academicYear, isCurrent: true },
    });
    if (incumbent) {
      return {
        error: `AY ${academicYear} already has a ${position === "PRESIDENT" ? "President" : "Secretary"}. Remove the incumbent first.`,
      };
    }
  }

  try {
    await db.organizationMember.create({
      data: {
        organizationId,
        userId: memberId,
        position: position as "PRESIDENT" | "SECRETARY" | "MEMBER",
        academicYear,
      },
    });
  } catch {
    return { error: "This student is already a member for the selected academic year." };
  }

  await writeAudit({
    userId: user.id,
    action: "MEMBER_ADDED",
    entityType: "Organization",
    entityId: organizationId,
    entityLabel: org.name,
    newState: {
      member: `${memberUser.firstName} ${memberUser.lastName}`,
      position,
      academicYear,
    },
  });
  revalidatePath(`/organizations/${organizationId}`);
  return { success: "Member added." };
}

export async function removeMember(formData: FormData): Promise<void> {
  const user = await requirePermissionOrThrow("org.manage");
  const membershipId = String(formData.get("membershipId") ?? "");

  const membership = await db.organizationMember.findUnique({
    where: { id: membershipId },
    include: { user: true, organization: true },
  });
  if (!membership) return;

  await db.organizationMember.delete({ where: { id: membershipId } });
  await writeAudit({
    userId: user.id,
    action: "MEMBER_REMOVED",
    entityType: "Organization",
    entityId: membership.organizationId,
    entityLabel: membership.organization.name,
    previousState: {
      member: `${membership.user.firstName} ${membership.user.lastName}`,
      position: membership.position,
      academicYear: membership.academicYear,
    },
  });
  revalidatePath(`/organizations/${membership.organizationId}`);
}

function isRedirect(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    ((e as { digest: string }).digest.startsWith("NEXT_REDIRECT"))
  );
}
