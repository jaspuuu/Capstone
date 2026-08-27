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
import { currentAcademicYear, formatDateTime, nextAcademicYear } from "@/lib/utils";
import { RECOGNITION_WORKFLOW } from "@/lib/workflow";
import {
  ATTACHMENT_KIND_LABELS,
  ATTACHMENT_KINDS,
  type AttachmentKind,
} from "@/lib/attachments";

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
  from: RecognitionStatus | null,
  to: RecognitionStatus | null,
  note?: string | null
) {
  await db.recognitionEvent.create({
    data: { recognitionId, actorId, action, fromStatus: from, toStatus: to, note: note ?? null },
  });
}

/**
 * §5: the SF-001 checklist gate. The application/renewal letter is the
 * submission itself so it is not checked here; the other six accreditation
 * documents must be present (uploaded against this recognition, or — for
 * accomplishment reports — satisfied by first-class filed reports) before the
 * application may be submitted. Returns the labels of the missing items.
 */
const FILED_REPORT_STATUSES = ["SUBMITTED", "ACCEPTED"] as const;

async function missingChecklistRequirements(
  recognitionId: string,
  organizationId: string,
  academicYear: string
): Promise<string[]> {
  const [tagged, filedReports] = await Promise.all([
    db.attachment.findMany({
      where: { entityType: "Recognition", entityId: recognitionId },
      select: { kind: true },
    }),
    db.accomplishmentReport.count({
      where: {
        organizationId,
        academicYear,
        status: { in: [...FILED_REPORT_STATUSES] },
      },
    }),
  ]);
  const kinds = new Set(
    tagged.map((a) => a.kind).filter((k): k is AttachmentKind => k !== null)
  );
  return ATTACHMENT_KINDS.filter((k) => {
    if (kinds.has(k)) return false;
    if (k === "ACCOMPLISHMENT_REPORTS" && filedReports > 0) return false;
    return true;
  }).map((k) => ATTACHMENT_KIND_LABELS[k]);
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
  | "ADVANCE_TO_SIGNATURE"
  | "RETURN"
  | "APPROVE"
  | "REJECT"
  | "CONFER";

// §6: the recognition chain's legal transitions live in the shared workflow
// registry — derived here so the engine is the only source of truth (§29).
const TRANSITIONS: Record<
  Transition,
  { from: RecognitionStatus[]; to: RecognitionStatus; needNote?: boolean }
> = Object.fromEntries(
  RECOGNITION_WORKFLOW.transitions.map((t) => [
    t.action,
    { from: [...t.from] as RecognitionStatus[], to: t.to, needNote: t.needNote },
  ])
) as Record<Transition, { from: RecognitionStatus[]; to: RecognitionStatus; needNote?: boolean }>;

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

    const rule = RECOGNITION_WORKFLOW.transitions.find((t) => t.action === transition);
    const permission = rule?.permission ?? "recognition.review";

    // ---- Authorization -----------------------------------------------------
    const officerTransition = transition === "SUBMIT";
    if (officerTransition) {
      if (!can(user, permission)) {
        return { error: "You do not have permission to submit this application." };
      }
      try {
        await assertOfficerOf(user.id, rec.organizationId);
      } catch {
        return { error: "Only current officers of this organization can submit." };
      }
      // §5: the SF-001 checklist must be complete before the application
      // (initial or renewal) can leave the draft stage.
      const gaps = await missingChecklistRequirements(
        rec.id,
        rec.organizationId,
        rec.academicYear
      );
      if (gaps.length > 0) {
        return {
          error: `Complete the SF-001 checklist before submitting: ${gaps.join(", ")}. You can upload them from the organization's Documents page.`,
        };
      }
    } else if (transition === "CONFER") {
      if (user.role !== "OSAS") {
        return { error: "Only OSAS can confer official recognition." };
      }
    } else if (permission === "recognition.approve") {
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
      ADVANCE_TO_SIGNATURE: "RECOGNITION_FOR_SIGNATURE",
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
      ADVANCE_TO_SIGNATURE: { type: "APPLICATION_FOR_SIGNATURE", title: "Application forwarded for signature" },
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
export const advanceToSignature = transitionAction("ADVANCE_TO_SIGNATURE");
export const returnApplication = transitionAction("RETURN");
export const approveApplication = transitionAction("APPROVE");
export const rejectApplication = transitionAction("REJECT");
export const conferRecognition = transitionAction("CONFER");

// ---------------------------------------------------------------------------
// §16-§18: interview stage. Reviewers schedule an interview and record its
// outcome without moving the application out of its current workflow status.
// ---------------------------------------------------------------------------

const INTERVIEW_OUTCOMES = [
  "COMPLETED",
  "FOR_ADDITIONAL_REVIEW",
  "PASSED",
  "NEEDS_REVISION",
] as const;

type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

async function assertInterviewScope(id: string) {
  const user = await requireUser();
  if (!can(user, "recognition.review")) {
    throw new Error("Only reviewers can manage the interview stage.");
  }
  const rec = await loadRecognition(id);
  if (!rec) throw new Error("Application not found.");
  try {
    await assertReviewerScope(user, rec.organization.collegeId);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Out of scope.");
  }
  if (!["SUBMITTED", "UNDER_REVIEW"].includes(rec.status)) {
    throw new Error(
      `Interviews apply only while an application is pending or under review (currently "${rec.status.replaceAll("_", " ").toLowerCase()}").`
    );
  }
  return { user, rec };
}

export async function scheduleInterview(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const id = String(formData.get("id") ?? "");
    const when = String(formData.get("interviewAt") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    const { user, rec } = await assertInterviewScope(id);

    if (!when) return { error: "Pick a date and time for the interview." };
    const interviewAt = new Date(when);
    if (Number.isNaN(interviewAt.getTime())) return { error: "Invalid date/time." };

    await db.recognition.update({
      where: { id },
      data: { interviewStatus: "SCHEDULED", interviewAt, interviewNotes: note || null },
    });
    await recordEvent(
      id,
      user.id,
      "INTERVIEW_SCHEDULED",
      rec.status,
      null,
      `Interview scheduled for ${formatDateTime(interviewAt)}${note ? ` — ${note}` : ""}`
    );
    await writeAudit({
      userId: user.id,
      action: "INTERVIEW_SCHEDULED",
      entityType: "Recognition",
      entityId: id,
      entityLabel: `${rec.organization.name} · AY ${rec.academicYear}`,
      newState: { interviewAt: interviewAt.toISOString(), note: note || undefined },
    });
    try {
      await notifyOrgOfficers(rec.organizationId, {
        type: "INTERVIEW_SCHEDULED",
        title: `Interview scheduled: ${rec.organization.name}`,
        body: `AY ${rec.academicYear} · ${formatDateTime(interviewAt)}${note ? ` · ${note.slice(0, 140)}` : ""}`,
        link: `/recognition/${id}`,
      });
    } catch {
      // Best-effort.
    }
    revalidatePath(`/recognition/${id}`);
    revalidatePath("/recognition");
    return { success: "Interview scheduled." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to schedule interview." };
  }
}

export async function recordInterviewOutcome(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const id = String(formData.get("id") ?? "");
    const outcome = String(formData.get("outcome") ?? "");
    const note = String(formData.get("note") ?? "").trim();

    if (!INTERVIEW_OUTCOMES.includes(outcome as InterviewOutcome)) {
      return { error: "Invalid interview outcome." };
    }
    const outcomeKey = outcome as InterviewOutcome;
    if (outcomeKey === "NEEDS_REVISION" && !note) {
      return { error: "Explain what needs to be revised." };
    }

    const { user, rec } = await assertInterviewScope(id);
    if (rec.interviewStatus === "NOT_SCHEDULED") {
      return { error: "Schedule the interview first." };
    }

    await db.recognition.update({
      where: { id },
      data: { interviewStatus: outcomeKey, interviewNotes: note || rec.interviewNotes },
    });
    const labels: Record<InterviewOutcome, string> = {
      COMPLETED: "Interview completed",
      FOR_ADDITIONAL_REVIEW: "Interview held — for additional review",
      PASSED: "Interview passed",
      NEEDS_REVISION: "Interview held — needs revision",
    };
    await recordEvent(id, user.id, `INTERVIEW_${outcomeKey}`, rec.status, null, `${labels[outcomeKey]}${note ? ` — ${note}` : ""}`);
    await writeAudit({
      userId: user.id,
      action: `INTERVIEW_${outcomeKey}`,
      entityType: "Recognition",
      entityId: id,
      entityLabel: `${rec.organization.name} · AY ${rec.academicYear}`,
      previousState: { interviewStatus: rec.interviewStatus },
      newState: { interviewStatus: outcomeKey, note: note || undefined },
    });
    revalidatePath(`/recognition/${id}`);
    revalidatePath("/recognition");
    return { success: labels[outcomeKey] + "." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to record outcome." };
  }
}

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
