"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Recognition, RecognitionStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requirePermissionOrThrow, requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { notifyOrgOfficers } from "@/lib/notifications";
import { currentAcademicYear, nextAcademicYear } from "@/lib/utils";

export type ActionState = { error?: string; success?: string };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function loadRecognition(id: string) {
  const rec = await db.recognition.findUnique({
    where: { id },
    include: {
      organization: true,
      events: { orderBy: { createdAt: "asc" }, include: { actor: true } },
    },
  });
  return rec;
}

/** Officers may act only on organizations they currently belong to. */
async function assertOfficerOf(userId: string, organizationId: string) {
  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId, isCurrent: true },
  });
  if (!membership) throw new Error("You are not a member of this organization.");
}

/**
 * Reviewers (OSAS/SOA campus-wide; Dean within their college).
 * Permission check happens through RBAC; scope check here.
 */
async function assertReviewerScope(
  user: { id: string; role: string; collegeId: string | null },
  organizationCollegeId: string
) {
  if (user.role === "DEAN" && user.collegeId !== organizationCollegeId) {
    throw new Error("This application belongs to another college.");
  }
}

async function recordEvent(
  recognitionId: string,
  actorId: string,
  action: string,
  from: RecognitionStatus,
  to: RecognitionStatus,
  note?: string | null
) {
  await db.recognitionEvent.create({
    data: { recognitionId, actorId, action, fromStatus: from, toStatus: to, note: note ?? null },
  });
}

// ---------------------------------------------------------------------------
// Create (initial application or renewal) - officers or admins on behalf
// ---------------------------------------------------------------------------

const createSchema = z.object({
  organizationId: z.string().min(1),
  kind: z.enum(["INITIAL", "RENEWAL"]),
  academicYear: z
    .string()
    .regex(/^\d{4}-\d{4}$/, "Academic year must look like 2026-2027."),
  remarks: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function createRecognition(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requirePermissionOrThrow(
    formData.get("kind") === "RENEWAL" ? "renewal.submit" : "recognition.submit"
  );

  const parsed = createSchema.safeParse({
    organizationId: formData.get("organizationId"),
    kind: formData.get("kind"),
    academicYear: formData.get("academicYear"),
    remarks: formData.get("remarks") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { organizationId, kind, academicYear } = parsed.data;

  // Admins file on behalf; officers only for their own org.
  if (!can(user, "org.manage")) {
    await assertOfficerOf(user.id, organizationId);
  }

  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) return { error: "Organization not found." };
  if (org.status === "INACTIVE") {
    return { error: "Inactive organizations cannot file for recognition." };
  }

  // Renewals require an existing satisfied recognition in an earlier year.
  if (kind === "RENEWAL") {
    const prior = await db.recognition.findFirst({
      where: {
        organizationId,
        status: { in: ["APPROVED", "RECOGNIZED"] },
        academicYear: { lt: academicYear },
      },
    });
    if (!prior) {
      return { error: "Renewal requires a previously recognized period. File an initial application instead." };
    }
  }

  const duplicate = await db.recognition.findUnique({
    where: { organizationId_academicYear: { organizationId, academicYear } },
  });
  if (duplicate) {
    return { error: `An application for AY ${academicYear} already exists.` };
  }

  const rec = await db.recognition.create({
    data: {
      organizationId,
      kind,
      academicYear,
      status: "DRAFT",
      remarks: parsed.data.remarks || null,
    },
  });

  await writeAudit({
    userId: user.id,
    action: kind === "RENEWAL" ? "RENEWAL_STARTED" : "APPLICATION_CREATED",
    entityType: "Recognition",
    entityId: rec.id,
    entityLabel: `${org.name} · AY ${academicYear}`,
    newState: { kind, academicYear, status: "DRAFT" },
  });

  revalidatePath("/recognition");
  redirect(`/recognition/${rec.id}`);
}

// ---------------------------------------------------------------------------
// Lifecycle transitions
// ---------------------------------------------------------------------------

type Transition =
  | "SUBMIT"
  | "START_REVIEW"
  | "ENDORSE"
  | "RETURN"
  | "APPROVE"
  | "REJECT"
  | "CONFER";

const TRANSITIONS: Record<
  Transition,
  { from: RecognitionStatus[]; to: RecognitionStatus; needNote?: boolean }
> = {
  SUBMIT: { from: ["DRAFT", "RETURNED"], to: "SUBMITTED" },
  START_REVIEW: { from: ["SUBMITTED"], to: "UNDER_REVIEW" },
  ENDORSE: { from: ["UNDER_REVIEW"], to: "FOR_APPROVAL" },
  RETURN: { from: ["SUBMITTED", "UNDER_REVIEW", "FOR_APPROVAL"], to: "RETURNED", needNote: true },
  APPROVE: { from: ["FOR_APPROVAL"], to: "APPROVED" },
  REJECT: { from: ["SUBMITTED", "UNDER_REVIEW", "FOR_APPROVAL"], to: "REJECTED", needNote: true },
  CONFER: { from: ["APPROVED"], to: "RECOGNIZED" },
};

function transitionAction(transition: Transition) {
  return async function action(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const note = String(formData.get("note") ?? "").trim();

    const spec = TRANSITIONS[transition];
    if (spec.needNote && !note) {
      return { error: "A note explaining the decision is required." };
    }

    const rec = await loadRecognition(id);
    if (!rec) return { error: "Application not found." };

    // ---- Authorization -----------------------------------------------------
    const officerTransition = transition === "SUBMIT";
    if (officerTransition) {
      if (!can(user, "recognition.submit")) {
        return { error: "You do not have permission to submit this application." };
      }
      try {
        await assertOfficerOf(user.id, rec.organizationId);
      } catch {
        return { error: "Only current officers of this organization can submit." };
      }
    } else if (transition === "CONFER") {
      if (user.role !== "OSAS") {
        return { error: "Only OSAS can confer official recognition." };
      }
    } else if (transition === "APPROVE" || transition === "REJECT") {
      if (!can(user, "recognition.approve")) {
        return { error: "You do not have permission to decide this application." };
      }
      try {
        await assertReviewerScope(user, rec.organization.collegeId);
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Out of scope." };
      }
    } else {
      if (!can(user, "recognition.review")) {
        return { error: "You do not have permission to review this application." };
      }
      try {
        await assertReviewerScope(user, rec.organization.collegeId);
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Out of scope." };
      }
    }

    // ---- State machine -----------------------------------------------------
    if (!spec.from.includes(rec.status)) {
      return { error: `Cannot perform this action while the application is "${rec.status.replaceAll("_", " ").toLowerCase()}".` };
    }

    const now = new Date();
    const data: Partial<Recognition> = { status: spec.to };
    if (spec.to === "SUBMITTED") data.submittedAt = now;
    if (spec.to === "UNDER_REVIEW") data.reviewedAt = now;
    if (["APPROVED", "RECOGNIZED", "REJECTED"].includes(spec.to)) {
      data.decidedAt = now;
      data.decidedById = user.id;
      if (note) data.remarks = note;
    }
    if (spec.to === "RETURNED" && note) data.remarks = note;

    await db.recognition.update({ where: { id }, data: data as never });
    await recordEvent(id, user.id, transition, rec.status, spec.to, note || null);

    const auditAction: Record<Transition, string> = {
      SUBMIT: "APPLICATION_SUBMITTED",
      START_REVIEW: "REVIEW_STARTED",
      ENDORSE: "ENDORSED_FOR_APPROVAL",
      RETURN: "APPLICATION_RETURNED",
      APPROVE: "APPLICATION_APPROVED",
      REJECT: "APPLICATION_REJECTED",
      CONFER: "RECOGNITION_CONFERRED",
    };
    await writeAudit({
      userId: user.id,
      action: auditAction[transition],
      entityType: "Recognition",
      entityId: id,
      entityLabel: `${rec.organization.name} · AY ${rec.academicYear}`,
      previousState: { status: rec.status },
      newState: { status: spec.to, note: note || undefined },
    });

    // Part 9: alert the organization's officers when a decision lands.
    const outcomeMap: Partial<
      Record<Transition, { type: string; title: string }>
    > = {
      RETURN: { type: "APPLICATION_RETURNED", title: "Application returned for revision" },
      REJECT: { type: "APPLICATION_REJECTED", title: "Application disapproved" },
      APPROVE: { type: "APPLICATION_APPROVED", title: "Application approved" },
      CONFER: { type: "RECOGNITION_CONFERRED", title: "Official recognition conferred" },
    };
    const outcome = outcomeMap[transition];
    if (outcome) {
      try {
        await notifyOrgOfficers(rec.organizationId, {
          type: outcome.type,
          title: `${outcome.title}: ${rec.organization.name}`,
          body: [
            `AY ${rec.academicYear}`,
            note ? `Note: ${note.slice(0, 160)}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          link: `/recognition/${id}`,
        });
      } catch {
        // Best-effort.
      }
    }

    revalidatePath(`/recognition/${id}`);
    revalidatePath("/recognition");
    revalidatePath("/dashboard");
    return { success: "Action recorded." };
  };
}

export const submitRecognition = transitionAction("SUBMIT");
export const startReview = transitionAction("START_REVIEW");
export const endorseForApproval = transitionAction("ENDORSE");
export const returnApplication = transitionAction("RETURN");
export const approveApplication = transitionAction("APPROVE");
export const rejectApplication = transitionAction("REJECT");
export const conferRecognition = transitionAction("CONFER");

// ---------------------------------------------------------------------------
// Quick-start renewal for the next academic year (officers/admins)
// ---------------------------------------------------------------------------

export async function quickStartRenewal(formData: FormData): Promise<void> {
  const user = await requirePermissionOrThrow("renewal.submit");
  const organizationId = String(formData.get("organizationId") ?? "");
  const ay = nextAcademicYear(currentAcademicYear());

  if (!can(user, "org.manage")) {
    await assertOfficerOf(user.id, organizationId);
  }

  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org || org.status === "INACTIVE") return;

  const duplicate = await db.recognition.findUnique({
    where: { organizationId_academicYear: { organizationId, academicYear: ay } },
  });
  if (duplicate) {
    redirect(`/recognition/${duplicate.id}`);
  }

  const prior = await db.recognition.findFirst({
    where: { organizationId, status: { in: ["APPROVED", "RECOGNIZED"] } },
    orderBy: { academicYear: "desc" },
  });
  if (!prior) return;

  const rec = await db.recognition.create({
    data: { organizationId, kind: "RENEWAL", academicYear: ay, status: "DRAFT" },
  });
  await writeAudit({
    userId: user.id,
    action: "RENEWAL_STARTED",
    entityType: "Recognition",
    entityId: rec.id,
    entityLabel: `${org.name} · AY ${ay}`,
    newState: { kind: "RENEWAL", academicYear: ay, status: "DRAFT" },
  });
  revalidatePath("/recognition");
  redirect(`/recognition/${rec.id}`);
}
