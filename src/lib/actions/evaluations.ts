"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { can, scopedOrgWhere } from "@/lib/auth/rbac";

// ---------------------------------------------------------------------------
// M&E rubric evaluation. One explicit officer-entered evaluation per activity
// on four 1-5 dimensions. The system never invents a rating.
// ---------------------------------------------------------------------------

export const EVALUATION_DIMENSIONS = [
  { key: "relevance", label: "Relevance", help: "Alignment of the activity with the organization's objectives." },
  { key: "impact", label: "Impact", help: "Observable results and benefit to participants." },
  { key: "efficiency", label: "Efficiency", help: "Use of time, budget and resources." },
  { key: "sustainability", label: "Sustainability", help: "Likelihood the gains continue after the activity." },
] as const;

export type EvaluationState = { error?: string; ok?: string };
export type EvaluationInput = {
  activityId: string;
  relevance: number;
  impact: number;
  efficiency: number;
  sustainability: number;
  remarks: string | null;
};

export async function saveEvaluation(
  _prev: EvaluationState,
  formData: FormData
): Promise<EvaluationState> {
  try {
    const user = await requireUser();
    if (!can(user, "analytics.view")) {
      return { error: "Only analytics officers (OSAS/SOA/Dean) can record evaluations." };
    }
    const activityId = String(formData.get("activityId") ?? "");
    const raw: Record<string, number> = {};
    for (const d of EVALUATION_DIMENSIONS) {
      const v = Number(String(formData.get(d.key) ?? ""));
      if (!Number.isInteger(v) || v < 1 || v > 5) {
        return { error: `“${d.label}” must be a whole number from 1 to 5.` };
      }
      raw[d.key] = v;
    }
    const remarks = String(formData.get("remarks") ?? "").trim().slice(0, 2000) || null;

    const activity = await db.activityProposal.findFirst({
      where: { id: activityId, organization: scopedOrgWhere(user, {}) },
      select: { id: true },
    });
    if (!activity) return { error: "Activity not found or outside your scope." };

    await db.activityEvaluation.upsert({
      where: { activityId },
      update: {
        evaluatorId: user.id,
        relevance: raw.relevance,
        impact: raw.impact,
        efficiency: raw.efficiency,
        sustainability: raw.sustainability,
        remarks,
      },
      create: {
        activityId: activity.id,
        evaluatorId: user.id,
        relevance: raw.relevance,
        impact: raw.impact,
        efficiency: raw.efficiency,
        sustainability: raw.sustainability,
        remarks,
      },
    });

    revalidatePath(`/activities/${activityId}`);
    revalidatePath("/analytics");
    return { ok: "Evaluation saved." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Saving the evaluation failed." };
  }
}