"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { notifyOrgOfficers, notifyOrgAdvisers } from "@/lib/notifications";
import { expectedFollowUpDate } from "@/lib/follow-up";

export type ActionState = { error?: string; success?: string };

/**
 * §24: create the follow-up tracking record automatically when an application
 * is submitted. Called from the recognition SUBMIT transition.
 */
export async function ensureFollowUpForRecognition(recognitionId: string, submittedAt: Date): Promise<void> {
  try {
    const existing = await db.recognitionFollowUp.findUnique({ where: { recognitionId } });
    if (existing) return;
    await db.recognitionFollowUp.create({
      data: {
        recognitionId,
        expectedDate: expectedFollowUpDate(submittedAt),
        status: "PENDING",
      },
    });
  } catch {
    // Best-effort — follow-up is a tracking aid, never blocks the submission.
  }
}

/** §24: mark the follow-up window started (e.g. reviewer contacted the org). */
export async function recordFollowUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    if (!can(user, "recognition.review")) {
      return { error: "Only reviewers can record follow-ups." };
    }
    const id = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "");
    const note = String(formData.get("note") ?? "").trim();

    if (!["PENDING", "CONTACTED", "COMPLETED", "OVERDUE", "SKIPPED"].includes(status)) {
      return { error: "Invalid follow-up status." };
    }
    if (status === "OVERDUE" && !note) {
      return { error: "Add a note explaining why the follow-up is overdue." };
    }

    const followUp = await db.recognitionFollowUp.findUnique({
      where: { id },
      include: { recognition: { select: { id: true, academicYear: true, organization: { select: { id: true, name: true } } } } },
    });
    if (!followUp) return { error: "Follow-up record not found." };

    const completed = status === "COMPLETED";
    await db.recognitionFollowUp.update({
      where: { id },
      data: {
        status: status as "PENDING" | "CONTACTED" | "COMPLETED" | "OVERDUE" | "SKIPPED",
        notes: note || followUp.notes,
        completedAt: completed ? new Date() : null,
        completedById: completed ? user.id : null,
      },
    });

    await writeAudit({
      userId: user.id,
      action: "FOLLOW_UP_RECORDED",
      entityType: "Recognition",
      entityId: followUp.recognitionId,
      entityLabel: `${followUp.recognition.organization.name} · AY ${followUp.recognition.academicYear}`,
      previousState: { status: followUp.status },
      newState: { status, note: note || undefined },
    });

    if (status === "CONTACTED" || status === "OVERDUE") {
      const followUpKind = {
        entityType: "Recognition",
        entityId: followUp.recognitionId,
        link: `/organizations/${followUp.recognition.organization.id}/accreditation`,
      } as const;
      await notifyOrgOfficers(followUp.recognition.organization.id, {
        ...followUpKind,
        type: "FOLLOW_UP",
        category: "FOLLOW_UP",
        priority: "ACTION_REQUIRED",
        title: `Follow-up on your application: ${followUp.recognition.organization.name}`,
        body: `OSAS is following up on your AY ${followUp.recognition.academicYear} application.${
          note ? ` ${note.slice(0, 140)}` : ""
        }`,
        academicYear: followUp.recognition.academicYear,
        reason: "You lead this organization; OSAS is waiting on its accreditation requirements.",
      }, { academicYear: followUp.recognition.academicYear });
      await notifyOrgAdvisers(followUp.recognition.organization.id, {
        ...followUpKind,
        type: "FOLLOW_UP",
        category: "FOLLOW_UP",
        priority: "ATTENTION",
        title: `Follow-up on ${followUp.recognition.organization.name} application`,
        body: `A follow-up was recorded for AY ${followUp.recognition.academicYear}.${note ? ` ${note.slice(0, 140)}` : ""}`,
        academicYear: followUp.recognition.academicYear,
        reason: "You advise this organization and are copied on OSAS follow-ups.",
      }, { academicYear: followUp.recognition.academicYear });
    }

    revalidatePath(`/organizations/${followUp.recognition.organization.id}/accreditation`);
    revalidatePath("/recognition");
    return { success: "Follow-up recorded." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to record follow-up." };
  }
}