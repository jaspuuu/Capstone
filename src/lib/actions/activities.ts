"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActivityScope, ProposalStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requirePermissionOrThrow, requireUser } from "@/lib/auth/guards";
import { can, isAdminRole } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { notifyOrgOfficers } from "@/lib/notifications";
import { currentAcademicYear } from "@/lib/utils";
import { ACTIVITY_WORKFLOW } from "@/lib/workflow";

export type ActionState = { error?: string; success?: string };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function loadProposal(id: string) {
  return db.activityProposal.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          members: { where: { isCurrent: true }, select: { userId: true, position: true } },
        },
      },
    },
  });
}

/** Officers (president/secretary) may act only on their own organization. */
function isOfficerOf(
  userId: string,
  org: { members: { userId: string; position: string }[] }
): boolean {
  return org.members.some(
    (m) => m.userId === userId && (m.position === "PRESIDENT" || m.position === "SECRETARY")
  );
}

/** Current adviser (either type) of the organization. */
async function isCurrentAdviser(userId: string, organizationId: string): Promise<boolean> {
  const assignment = await db.adviserAssignment.findFirst({
    where: { adviserId: userId, organizationId, isCurrent: true },
  });
  return Boolean(assignment);
}

/**
 * Approval authority. Configurable policy:
 * - COLLEGE-scope proposals are approved by the dean of the organization's college.
 * - UNIVERSITY-scope proposals require OSAS/SOA.
 * - ORGANIZATION-scope proposals follow the college path by default.
 */
function assertApprovalAuthority(
  user: { role: string; collegeId: string | null },
  scope: ActivityScope,
  organizationCollegeId: string | null
) {
  if (isAdminRole(user.role as never)) return;
  if (user.role !== "DEAN") throw new Error("Not allowed.");
  if (scope === "UNIVERSITY") {
    throw new Error("University-wide activities are approved by OSAS.");
  }
  if (user.collegeId !== organizationCollegeId) {
    throw new Error("This proposal belongs to another college.");
  }
}

const baseSchema = z
  .object({
    organizationId: z.string().min(1),
    title: z.string().trim().min(3, "Title is required.").max(200),
    description: z.string().trim().min(10, "Describe the activity in at least 10 characters.").max(4000),
    objectives: z.string().trim().max(4000).optional().or(z.literal("")),
    venue: z.string().trim().max(200).optional().or(z.literal("")),
    startAt: z.string().min(1, "Start date and time are required."),
    endAt: z.string().min(1, "End date and time are required."),
    scope: z.enum(["ORGANIZATION", "COLLEGE", "UNIVERSITY"]),
    estimatedBudget: z.coerce.number().min(0).max(100_000_000).optional(),
    expectedParticipants: z.coerce.number().int().min(1).max(100_000).optional(),
  })
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), {
    message: "The end must be after the start.",
    path: ["endAt"],
  });

function parseForm(formData: FormData) {
  return baseSchema.safeParse({
    organizationId: formData.get("organizationId"),
    title: formData.get("title"),
    description: formData.get("description"),
    objectives: formData.get("objectives") || "",
    venue: formData.get("venue") || "",
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
    scope: formData.get("scope"),
    estimatedBudget: formData.get("estimatedBudget") || undefined,
    expectedParticipants: formData.get("expectedParticipants") || undefined,
  });
}

// ---------------------------------------------------------------------------
// Create / update — officers or admins on behalf
// ---------------------------------------------------------------------------

export async function createActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermissionOrThrow("activity.submit");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  // Admins file on behalf; officers only for their own org.
  if (!can(user, "org.manage")) {
    const membership = await db.organizationMember.findFirst({
      where: {
        userId: user.id,
        organizationId: d.organizationId,
        isCurrent: true,
        position: { in: ["PRESIDENT", "SECRETARY"] },
      },
    });
    if (!membership) return { error: "Only officers of the organization can file proposals." };
  }

  try {
    const proposal = await db.activityProposal.create({
      data: {
        organizationId: d.organizationId,
        academicYear: currentAcademicYear(),
        title: d.title,
        description: d.description,
        objectives: d.objectives || null,
        venue: d.venue || null,
        startAt: new Date(d.startAt),
        endAt: new Date(d.endAt),
        scope: d.scope as ActivityScope,
        estimatedBudget: d.estimatedBudget ?? null,
        expectedParticipants: d.expectedParticipants ?? null,
      },
    });
    await writeAudit({
      userId: user.id,
      action: "ACTIVITY_CREATED",
      entityType: "ActivityProposal",
      entityId: proposal.id,
      entityLabel: d.title,
      newState: { organizationId: d.organizationId, scope: d.scope, status: "DRAFT" },
    });
  } catch {
    return { error: "Could not create the proposal." };
  }

  revalidatePath("/activities");
  redirect("/activities");
}

export async function updateActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermissionOrThrow("activity.submit");
  const id = String(formData.get("id") ?? "");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const proposal = await loadProposal(id);
  if (!proposal) return { error: "Proposal not found." };

  const editable = proposal.status === "DRAFT" || proposal.status === "RETURNED";
  if (!editable) return { error: "Only drafts or returned proposals can be edited." };

  if (!can(user, "org.manage") && !isOfficerOf(user.id, proposal.organization)) {
    return { error: "Only officers of the organization can edit this proposal." };
  }

  try {
    await db.activityProposal.update({
      where: { id },
      data: {
        title: d.title,
        description: d.description,
        objectives: d.objectives || null,
        venue: d.venue || null,
        startAt: new Date(d.startAt),
        endAt: new Date(d.endAt),
        scope: d.scope as ActivityScope,
        estimatedBudget: d.estimatedBudget ?? null,
        expectedParticipants: d.expectedParticipants ?? null,
      },
    });
  } catch {
    return { error: "Could not update the proposal." };
  }

  await writeAudit({
    userId: user.id,
    action: "ACTIVITY_UPDATED",
    entityType: "ActivityProposal",
    entityId: id,
    entityLabel: d.title,
    previousState: {
      title: proposal.title,
      description: proposal.description,
      venue: proposal.venue,
      startAt: proposal.startAt,
      endAt: proposal.endAt,
      scope: proposal.scope,
    },
    newState: { title: d.title, description: d.description, venue: d.venue, startAt: d.startAt, endAt: d.endAt, scope: d.scope },
  });

  revalidatePath("/activities");
  redirect(`/activities/${id}`);
}

// ---------------------------------------------------------------------------
// Lifecycle transitions
// ---------------------------------------------------------------------------

// §6/§20: the proposal chain's legal transitions + phase side-effects live in
// the shared workflow registry — derived here so there is one source of truth.
const TRANSITIONS: Record<
  "SUBMIT" | "ENDORSE" | "RETURN" | "APPROVE" | "REJECT",
  { from: ProposalStatus[]; to: ProposalStatus; needNote?: boolean; nextPhase?: string }
> = Object.fromEntries(
  ACTIVITY_WORKFLOW.transitions.map((t) => [
    t.action,
    { from: [...t.from] as ProposalStatus[], to: t.to, needNote: t.needNote, nextPhase: t.nextPhase },
  ])
) as Record<
  "SUBMIT" | "ENDORSE" | "RETURN" | "APPROVE" | "REJECT",
  { from: ProposalStatus[]; to: ProposalStatus; needNote?: boolean; nextPhase?: string }
>;

function transitionAction(transition: keyof typeof TRANSITIONS) {
  return async function action(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const note = String(formData.get("note") ?? "").trim();

    const spec = TRANSITIONS[transition];
    if (spec.needNote && !note) {
      return { error: "A note explaining the decision is required." };
    }

    const proposal = await loadProposal(id);
    if (!proposal) return { error: "Proposal not found." };
    if (user.isViewOnly) return { error: "Your account has view-only access." };
    if (!spec.from.includes(proposal.status)) {
      return { error: `This proposal cannot be ${spec.to.toLowerCase()} from its current status.` };
    }

    switch (transition) {
      case "SUBMIT": {
        if (!can(user, "org.manage") && !isOfficerOf(user.id, proposal.organization)) {
          return { error: "Only officers of the organization can submit this proposal." };
        }
        break;
      }
      case "ENDORSE": {
        const admin = isAdminRole(user.role as never);
        const adviser =
          (user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME") &&
          (await isCurrentAdviser(user.id, proposal.organizationId));
        if (!admin && !adviser) {
          return { error: "Only the organization's adviser can endorse this proposal." };
        }
        break;
      }
      case "RETURN":
      case "REJECT":
      case "APPROVE": {
        const admin = isAdminRole(user.role as never);
        const adviser =
          (user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME") &&
          (await isCurrentAdviser(user.id, proposal.organizationId));
        if (transition === "APPROVE") {
          try {
            assertApprovalAuthority(user, proposal.scope, proposal.organization.collegeId);
          } catch (e) {
            return { error: e instanceof Error ? e.message : "Not allowed." };
          }
        } else if (!admin && !adviser && !can(user, "activity.approve")) {
          return { error: "Not allowed." };
        }
        break;
      }
    }

    await db.activityProposal.update({
      where: { id },
      data: {
        status: spec.to,
        ...(spec.nextPhase ? { phase: spec.nextPhase as "PLAN" | "PROPOSAL" | "APPROVAL" | "IMPLEMENTATION" | "MONITORING" | "ACCOMPLISHMENT" | "ARCHIVE" } : {}),
        submittedAt: transition === "SUBMIT" ? new Date() : proposal.submittedAt,
        decidedAt: ["APPROVED", "REJECTED"].includes(spec.to) ? new Date() : proposal.decidedAt,
        decidedById: ["APPROVED", "REJECTED"].includes(spec.to) ? user.id : proposal.decidedById,
        remarks: note || proposal.remarks,
      },
    });

    const auditAction: Record<string, string> = {
      SUBMIT: "ACTIVITY_SUBMITTED",
      ENDORSE: "ACTIVITY_ENDORSED",
      RETURN: "ACTIVITY_RETURNED",
      APPROVE: "ACTIVITY_APPROVED",
      REJECT: "ACTIVITY_REJECTED",
    };
    await writeAudit({
      userId: user.id,
      action: auditAction[transition],
      entityType: "ActivityProposal",
      entityId: id,
      entityLabel: proposal.title,
      previousState: { status: proposal.status },
      newState: { status: spec.to, ...(note ? { note } : {}) },
    });

    // Part 9: alert the organization's officers on review decisions.
    const outcomeMap: Partial<
      Record<string, { type: string; title: string }>
    > = {
      RETURN: { type: "ACTIVITY_RETURNED", title: "Activity proposal returned for revision" },
      REJECT: { type: "ACTIVITY_REJECTED", title: "Activity proposal rejected" },
      APPROVE: { type: "ACTIVITY_APPROVED", title: "Activity proposal approved" },
    };
    const outcome = outcomeMap[transition];
    if (outcome) {
      try {
        await notifyOrgOfficers(proposal.organizationId, {
          type: outcome.type,
          title: `${outcome.title}: ${proposal.title}`,
          body: note ? `Note: ${note.slice(0, 160)}` : undefined,
          link: `/activities/${id}`,
        });
      } catch {
        // Best-effort.
      }
    }

    revalidatePath("/activities");
    revalidatePath(`/activities/${id}`);
    return { success: `Proposal ${spec.to.toLowerCase()}.` };
  };
}

export const submitActivity = transitionAction("SUBMIT");
export const endorseActivity = transitionAction("ENDORSE");
export const returnActivity = transitionAction("RETURN");
export const approveActivity = transitionAction("APPROVE");
export const rejectActivity = transitionAction("REJECT");
