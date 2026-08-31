"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ReportStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requirePermissionOrThrow, requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { notifyOrgOfficers } from "@/lib/notifications";
import { currentAcademicYear } from "@/lib/utils";
import { MEMBER_POSITION_LABELS } from "@/lib/constants";
import { REPORT_WORKFLOW } from "@/lib/workflow";

export type ActionState = { error?: string; success?: string };

async function loadReport(id: string) {
  return db.accomplishmentReport.findUnique({
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

function isOfficerOf(
  userId: string,
  org: { members: { userId: string; position: string }[] }
): boolean {
  return org.members.some(
    (m) => m.userId === userId && (m.position === "PRESIDENT" || m.position === "SECRETARY")
  );
}

const baseSchema = z.object({
  organizationId: z.string().min(1),
  activityProposalId: z.string().optional().or(z.literal("")),
  title: z.string().trim().min(3, "Title is required.").max(200),
  narrative: z
    .string()
    .trim()
    .min(20, "Summarize the activity in at least 20 characters.")
    .max(8000),
  heldOn: z.string().min(1, "The date of the activity is required."),
  duration: z.string().trim().max(100).optional().or(z.literal("")),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  conductedBy: z.string().trim().max(200).optional().or(z.literal("")),
  actualParticipants: z.coerce.number().int().min(0).max(100_000).optional(),
  actualBudget: z.coerce.number().min(0).max(100_000_000).optional(),
  budgetRemarks: z.string().trim().max(1000).optional().or(z.literal("")),
});

function parseForm(formData: FormData) {
  return baseSchema.safeParse({
    organizationId: formData.get("organizationId"),
    activityProposalId: formData.get("activityProposalId") || "",
    title: formData.get("title"),
    narrative: formData.get("narrative"),
    heldOn: formData.get("heldOn"),
    duration: formData.get("duration") || "",
    location: formData.get("location") || "",
    conductedBy: formData.get("conductedBy") || "",
    actualParticipants: formData.get("actualParticipants") || undefined,
    actualBudget: formData.get("actualBudget") || undefined,
    budgetRemarks: formData.get("budgetRemarks") || "",
  });
}

/**
 * Snapshot the selected current members as report participants. Only ids that
 * belong to the report organization's current roster are kept, so a tampered
 * form cannot reference strangers; PRESIDENT/SECRETARY rows are flagged.
 */
async function participantSnapshot(organizationId: string, selectedIds: string[]) {
  if (selectedIds.length === 0) return [];
  const roster = await db.organizationMember.findMany({
    where: { organizationId, isCurrent: true },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  const byId = new Map(roster.map((m) => [m.userId, m]));
  const isOfficer = (p: string | null) => p === "PRESIDENT" || p === "SECRETARY";
  const picked = selectedIds
    .filter((id) => byId.has(id))
    .map((id) => {
      const m = byId.get(id)!;
      return {
        memberId: m.id,
        name: `${m.user.firstName} ${m.user.lastName}`.trim(),
        positionLabel: isOfficer(m.position) ? MEMBER_POSITION_LABELS[m.position] ?? null : null,
        isOfficer: isOfficer(m.position),
      };
    });
  picked.sort((a, b) => Number(b.isOfficer) - Number(a.isOfficer));
  return picked;
}

/** Reject a held-on date still in the future (e.g. typo or pre-filed report). */
function heldOnInFuture(heldOn: string): boolean {
  const held = new Date(`${heldOn}T00:00:00`);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return held.getTime() > startOfToday.getTime();
}

// ---------------------------------------------------------------------------
// Create / update — officers or admins on behalf
// ---------------------------------------------------------------------------

export async function createReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermissionOrThrow("activity.submit");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  if (heldOnInFuture(d.heldOn)) {
    return { error: "The held-on date cannot be in the future." };
  }

  if (!can(user, "org.manage")) {
    const membership = await db.organizationMember.findFirst({
      where: {
        userId: user.id,
        organizationId: d.organizationId,
        isCurrent: true,
        position: { in: ["PRESIDENT", "SECRETARY"] },
      },
    });
    if (!membership) return { error: "Only officers of the organization can file reports." };
  }

  // A linked proposal must belong to the same organization, be approved, and
  // have its M&E outcome recorded as implemented (§24 enforcement).
  let proposalLink: string | null = null;
  if (d.activityProposalId) {
    const proposal = await db.activityProposal.findUnique({
      where: { id: d.activityProposalId },
      include: {
        report: { select: { id: true } },
        monitoring: { select: { status: true } },
      },
    });
    if (!proposal || proposal.organizationId !== d.organizationId) {
      return { error: "The selected activity proposal does not belong to this organization." };
    }
    if (proposal.status !== "APPROVED") {
      return { error: "Reports can only be linked to approved proposals." };
    }
    if (proposal.report) {
      return { error: "That proposal already has an accomplishment report." };
    }
    if (proposal.monitoring?.status !== "IMPLEMENTED") {
      return {
        error:
          "The activity's monitoring outcome must be marked \"Implemented\" before its accomplishment report can be filed.",
      };
    }
    proposalLink = proposal.id;
  }

  const participantIds = formData.getAll("participantIds").map(String).filter(Boolean);
  const participants = await participantSnapshot(d.organizationId, participantIds);
  const autoParticipants =
    participants.length > 0 && d.actualParticipants == null ? participants.length : undefined;

  try {
    const report = await db.accomplishmentReport.create({
      data: {
        organizationId: d.organizationId,
        academicYear: currentAcademicYear(),
        activityProposalId: proposalLink,
        title: d.title,
        narrative: d.narrative,
        heldOn: new Date(d.heldOn),
        duration: d.duration || null,
        location: d.location || null,
        conductedBy: d.conductedBy || null,
        actualParticipants: d.actualParticipants ?? autoParticipants ?? null,
        actualBudget: d.actualBudget ?? null,
        budgetRemarks: d.budgetRemarks || null,
        participants: participants.length > 0 ? { create: participants } : undefined,
      },
    });
    await writeAudit({
      userId: user.id,
      action: "REPORT_CREATED",
      entityType: "AccomplishmentReport",
      entityId: report.id,
      entityLabel: d.title,
      newState: { organizationId: d.organizationId, status: "DRAFT" },
    });
  } catch {
    return { error: "Could not create the report." };
  }

  revalidatePath("/reports");
  redirect("/reports");
}

export async function updateReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermissionOrThrow("activity.submit");
  const id = String(formData.get("id") ?? "");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  if (heldOnInFuture(d.heldOn)) {
    return { error: "The held-on date cannot be in the future." };
  }

  const report = await loadReport(id);
  if (!report) return { error: "Report not found." };
  if (report.status !== "DRAFT" && report.status !== "RETURNED") {
    return { error: "Only drafts or returned reports can be edited." };
  }
  if (!can(user, "org.manage") && !isOfficerOf(user.id, report.organization)) {
    return { error: "Only officers of the organization can edit this report." };
  }

  // The linked proposal cannot be changed to one from another organization,
  // and the new link must still honor the M&E "Implemented" gate.
  if (d.activityProposalId && d.activityProposalId !== report.activityProposalId) {
    const proposal = await db.activityProposal.findUnique({
      where: { id: d.activityProposalId },
      include: {
        report: { select: { id: true } },
        monitoring: { select: { status: true } },
      },
    });
    if (!proposal || proposal.organizationId !== d.organizationId || proposal.status !== "APPROVED" || proposal.report) {
      return { error: "That activity proposal cannot be linked to this report." };
    }
    if (proposal.monitoring?.status !== "IMPLEMENTED") {
      return {
        error:
          "The activity's monitoring outcome must be marked \"Implemented\" before its accomplishment report can be filed.",
      };
    }
  }

  const participantIds = formData.getAll("participantIds").map(String).filter(Boolean);
  const participants = await participantSnapshot(d.organizationId, participantIds);
  const autoParticipants =
    participants.length > 0 && d.actualParticipants == null ? participants.length : undefined;

  try {
    await db.accomplishmentReport.update({
      where: { id },
      data: {
        title: d.title,
        narrative: d.narrative,
        heldOn: new Date(d.heldOn),
        duration: d.duration || null,
        location: d.location || null,
        conductedBy: d.conductedBy || null,
        actualParticipants: d.actualParticipants ?? autoParticipants ?? null,
        actualBudget: d.actualBudget ?? null,
        budgetRemarks: d.budgetRemarks || null,
        ...(d.activityProposalId ? { activityProposalId: d.activityProposalId } : {}),
        participants: { deleteMany: {}, create: participants },
      },
    });
  } catch {
    return { error: "Could not update the report." };
  }

  await writeAudit({
    userId: user.id,
    action: "REPORT_UPDATED",
    entityType: "AccomplishmentReport",
    entityId: id,
    entityLabel: d.title,
    previousState: { title: report.title, heldOn: report.heldOn },
    newState: { title: d.title, heldOn: d.heldOn },
  });

  revalidatePath("/reports");
  redirect(`/reports/${id}`);
}

// ---------------------------------------------------------------------------
// Lifecycle transitions
// ---------------------------------------------------------------------------

// §6/§24: report transitions live in the shared workflow registry — derived
// here so the engine is the only source of truth.
const TRANSITIONS: Record<
  "SUBMIT" | "RETURN" | "ACCEPT",
  { from: ReportStatus[]; to: ReportStatus; needNote?: boolean }
> = Object.fromEntries(
  REPORT_WORKFLOW.transitions.map((t) => [
    t.action,
    { from: [...t.from] as ReportStatus[], to: t.to, needNote: t.needNote },
  ])
) as Record<"SUBMIT" | "RETURN" | "ACCEPT", { from: ReportStatus[]; to: ReportStatus; needNote?: boolean }>;

function transitionAction(transition: keyof typeof TRANSITIONS) {
  return async function action(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const note = String(formData.get("note") ?? "").trim();

    const spec = TRANSITIONS[transition];
    if (spec.needNote && !note) {
      return { error: "A note explaining the decision is required." };
    }

    const report = await loadReport(id);
    if (!report) return { error: "Report not found." };
    if (user.isViewOnly) return { error: "Your account has view-only access." };
    if (!spec.from.includes(report.status)) {
      return { error: `This report cannot be ${spec.to.toLowerCase()} from its current status.` };
    }

    if (transition === "SUBMIT") {
      if (!can(user, "org.manage") && !isOfficerOf(user.id, report.organization)) {
        return { error: "Only officers of the organization can submit this report." };
      }
      // Planned-activity reports require at least one piece of supporting
      // evidence before they can be submitted for review.
      if (report.activityProposalId) {
        const evidence = await db.attachment.count({
          where: { entityType: "AccomplishmentReport", entityId: id },
        });
        if (evidence === 0) {
          return {
            error: "Attach at least one supporting document before submitting a report for a planned activity.",
          };
        }
      }
    } else {
      // Review authority mirrors recognition review scoping:
      // OSAS/SOA campus-wide; deans within their college.
      if (!can(user, "activity.approve")) return { error: "Not allowed." };
      if (
        user.role === "DEAN" &&
        report.organization.collegeId !== user.collegeId
      ) {
        return { error: "This report belongs to another college." };
      }
    }

    await db.accomplishmentReport.update({
      where: { id },
      data: {
        status: spec.to,
        submittedAt: transition === "SUBMIT" ? new Date() : report.submittedAt,
        reviewedAt: transition === "ACCEPT" ? new Date() : report.reviewedAt,
        decidedById: transition === "ACCEPT" ? user.id : report.decidedById,
        remarks: note || report.remarks,
      },
    });

    // Accepting a linked report marks the activity as ACCOMPLISHED.
    if (transition === "ACCEPT" && report.activityProposalId) {
      const proposal = await db.activityProposal.findUnique({
        where: { id: report.activityProposalId },
      });
      if (proposal && proposal.status === "APPROVED") {
        await db.activityProposal.update({
          where: { id: proposal.id },
          data: { phase: "ACCOMPLISHMENT", decidedById: user.id, decidedAt: new Date() },
        });
        await writeAudit({
          userId: user.id,
          action: "ACTIVITY_COMPLETED",
          entityType: "ActivityProposal",
          entityId: proposal.id,
          entityLabel: proposal.title,
          previousState: { status: "APPROVED", phase: proposal.phase },
          newState: { status: "APPROVED", phase: "ACCOMPLISHMENT", viaReportId: id },
        });
      }
    }

    const auditAction: Record<string, string> = {
      SUBMIT: "REPORT_SUBMITTED",
      RETURN: "REPORT_RETURNED",
      ACCEPT: "REPORT_ACCEPTED",
    };
    await writeAudit({
      userId: user.id,
      action: auditAction[transition],
      entityType: "AccomplishmentReport",
      entityId: id,
      entityLabel: report.title,
      previousState: { status: report.status },
      newState: { status: spec.to, ...(note ? { note } : {}) },
    });

    // Part 9: alert the organization's officers on review decisions.
    const outcomeMap: Partial<
      Record<string, { type: string; title: string }>
    > = {
      RETURN: { type: "REPORT_RETURNED", title: "Accomplishment report returned for revision" },
      ACCEPT: { type: "REPORT_ACCEPTED", title: "Accomplishment report accepted" },
    };
    const outcome = outcomeMap[transition];
    if (outcome) {
      try {
        await notifyOrgOfficers(report.organizationId, {
          type: outcome.type,
          title: `${outcome.title}: ${report.title}`,
          body: note ? `Note: ${note.slice(0, 160)}` : undefined,
          link: `/reports/${id}`,
        });
      } catch {
        // Best-effort.
      }
    }

    revalidatePath("/reports");
    revalidatePath(`/reports/${id}`);
    revalidatePath("/activities");
    return { success: `Report ${spec.to.toLowerCase()}.` };
  };
}

export const submitReport = transitionAction("SUBMIT");
export const returnReport = transitionAction("RETURN");
export const acceptReport = transitionAction("ACCEPT");
