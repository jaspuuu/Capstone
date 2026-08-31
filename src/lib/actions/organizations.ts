"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/rbac";
import { requirePermissionOrThrow, requireUser } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { notifyOrgOfficers } from "@/lib/notifications";
import { currentAcademicYear, formatDateTime } from "@/lib/utils";
import { saveAttachmentFile, deleteAttachmentFile } from "@/lib/attachments";
import { ORG_APPLICATION_WORKFLOW } from "@/lib/workflow";
import { orgAppRequirements, orgAppSubmissionGaps } from "@/lib/org-application";
import type { OrgApplicationStatus, Role } from "@/generated/prisma/client";

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

// ---------------------------------------------------------------------------
// Â§28: organization logos â€” PNG/JPEG/WebP up to 2 MB, stored like any other
// file and served from /logo/[orgId]. The on-disk name keeps the extension,
// which is all the serving route needs for its content type.
// ---------------------------------------------------------------------------

const LOGO_MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

async function readLogo(
  formData: FormData
): Promise<{ storedName: string; bytes: Buffer } | null | "invalid"> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return null;
  const ext = LOGO_MIME_EXT[file.type];
  if (!ext) return "invalid";
  if (file.size > MAX_LOGO_BYTES) return "invalid";
  const bytes = Buffer.from(await file.arrayBuffer());
  return { storedName: `${randomBytes(24).toString("hex")}${ext}`, bytes };
}

/**
 * §5: who may edit an organization's profile. Admins (org.manage) always may;
 * the President/Secretary may only edit their own application while it is
 * still a DRAFT or was RETURNED for revision — never once under review.
 */
async function requireOrgProfileEditor(organizationId: string) {
  const user = await requirePermissionOrThrow("org.view");
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new Error("Organization not found.");
  if (can(user, "org.manage")) return { user, org };
  if (can(user, "org.submit")) {
    if (!["DRAFT", "RETURNED"].includes(org.applicationStatus)) {
      throw new Error(
        "Details can only be edited while the application is a draft or was returned for revision."
      );
    }
    const officer = await db.organizationMember.findFirst({
      where: {
        organizationId,
        userId: user.id,
        position: { in: ["PRESIDENT", "SECRETARY"] },
        isCurrent: true,
        status: "ACTIVE",
      },
    });
    if (!officer) {
      throw new Error("Only the organization's President or Secretary can edit this application.");
    }
    return { user, org };
  }
  throw new Error("You do not have permission to edit this organization.");
}

export async function createOrganization(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  // §5: the President creates the organization (org.submit); advisers/deans
  // only review. Admins may still create on the President's behalf.
  const user = await requirePermissionOrThrow("org.submit");

  const parsed = parseOrgForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  if (data.type === "CHILD" && !data.parentId) {
    return { error: "A sub-organization must have a mother organization." };
  }

  const logo = await readLogo(formData);
  if (logo === "invalid") {
    return { error: "The logo must be a PNG, JPEG, or WebP image up to 2 MB." };
  }

  // §28: officers and adviser must be real active accounts — no free-text
  // names. When an officer (President/Secretary) creates the org, they are
  // themselves registered as the founding President.
  const ay = currentAcademicYear();
  const isOfficerCreator = user.role === "PRESIDENT" || user.role === "SECRETARY";
  const presidentId = isOfficerCreator
    ? user.id
    : String(formData.get("presidentId") ?? "");
  const secretaryId = String(formData.get("secretaryId") ?? "");
  const adviserId = String(formData.get("adviserId") ?? "");

  if (secretaryId && secretaryId === presidentId) {
    return { error: "The President and the Secretary must be different students." };
  }
  const officerIds = [presidentId, secretaryId].filter(Boolean);
  const officers = officerIds.length
    ? await db.user.findMany({
        where: { id: { in: officerIds }, isActive: true, role: { in: ["MEMBER", "PRESIDENT", "SECRETARY"] } },
      })
    : [];
  for (const pid of officerIds) {
    if (!officers.some((o) => o.id === pid)) {
      return { error: "Selected officer account was not found, is inactive, or is not a student." };
    }
  }

  let adviser: { id: string; firstName: string; lastName: string } | null = null;
  if (adviserId) {
    const found = await db.user.findFirst({
      where: { id: adviserId, isActive: true, role: "ADVISER_REGULAR" },
    });
    if (!found) {
      return { error: "The selected adviser must be an active Senior Adviser (Regular Faculty) account." };
    }
    const clash = await db.adviserAssignment.findFirst({
      where: { adviserId, academicYear: ay, isCurrent: true },
    });
    if (clash) {
      return { error: `${found.firstName} ${found.lastName} already advises another organization for AY ${ay}.` };
    }
    adviser = found;
  }

  try {
    // A new organization is always a DRAFT application — creating it never
    // confers recognition (§5). Recognition comes when OSAS approves the
    // application chain.
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
        applicationStatus: "DRAFT",
        ...(logo ? { logoStoredName: logo.storedName } : {}),
      },
    });
    if (logo) await saveAttachmentFile(logo.storedName, logo.bytes);

    // Seed the roster so the President can keep building the draft.
    for (const o of officers) {
      await db.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: o.id,
          position: o.id === presidentId ? "PRESIDENT" : "SECRETARY",
          status: "ACTIVE",
          academicYear: ay,
          decidedAt: new Date(),
          decidedById: user.id,
        },
      });
    }
    if (adviser) {
      await db.adviserAssignment.create({
        data: { organizationId: org.id, adviserId: adviser.id, type: "REGULAR", academicYear: ay },
      });
    }

    await writeAudit({
      userId: user.id,
      action: "ORGANIZATION_CREATED",
      entityType: "Organization",
      entityId: org.id,
      entityLabel: org.name,
      newState: {
        ...data,
        applicationStatus: "DRAFT",
        logo: Boolean(logo),
        officers: officerIds.length,
        adviser: adviser ? `${adviser.firstName} ${adviser.lastName}` : undefined,
      },
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
  const id = String(formData.get("id") ?? "");

  // §5: admins (org.manage) may edit any org; the President/Secretary may
  // edit their own org only while it is a draft or returned for revision.
  let user: Awaited<ReturnType<typeof requireOrgProfileEditor>>["user"];
  let existing: Awaited<ReturnType<typeof requireOrgProfileEditor>>["org"];
  try {
    const ctx = await requireOrgProfileEditor(id);
    user = ctx.user;
    existing = ctx.org;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized." };
  }

  const parsed = parseOrgForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  if (data.type === "CHILD" && !data.parentId) {
    return { error: "A sub-organization must have a mother organization." };
  }
  if (data.parentId === id) {
    return { error: "An organization cannot be its own mother organization." };
  }

  const logo = await readLogo(formData);
  if (logo === "invalid") {
    return { error: "The logo must be a PNG, JPEG, or WebP image up to 2 MB." };
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
    if (logo) {
      if (existing.logoStoredName) await deleteAttachmentFile(existing.logoStoredName);
      await saveAttachmentFile(logo.storedName, logo.bytes);
      await db.organization.update({
        where: { id },
        data: { logoStoredName: logo.storedName },
      });
    }
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
// §5: Organization application workflow. The President creates the org
// (DRAFT), submits it, and it passes adviser → dean → SOA → OSAS before OSAS
// confers recognition. Reviewers never create organizations — they only
// advance or return an application that an officer filed.
//
//   DRAFT ──SUBMIT──▶ SUBMITTED ──START_REVIEW──▶ UNDER_REVIEW
//      ▲                   │             └─ADVISER_APPROVE──▶ FOR_SIGNATURE
//      │              RETURN ──▶ RETURNED            └─DEAN_APPROVE──▶ FOR_APPROVAL
//      │                   │                                 └─SOA_APPROVE──▶ APPROVED
//   resubmit (SUBMIT)      └────────   └─CONFER(OSAS)──▶ RECOGNIZED
//
// RETURN may be used at any review step by the reviewer whose turn it is;
// REJECT is an OSAS-only terminal decision.
// ---------------------------------------------------------------------------

type OrgAppTransition =
  | "SUBMIT"
  | "START_REVIEW"
  | "ADVISER_APPROVE"
  | "DEAN_APPROVE"
  | "SOA_APPROVE"
  | "CONFER"
  | "RETURN"
  | "REJECT";

// §5/§6: the org application transition rules live in the shared workflow
// registry (src/lib/workflow.ts) — the single source the actions AND the
// process tracker read. This map is derived so it cannot drift.
const ORG_APP_TRANSITIONS: Record<
  OrgAppTransition,
  { from: OrgApplicationStatus[]; to: OrgApplicationStatus; needNote?: boolean }
> = Object.fromEntries(
  ORG_APPLICATION_WORKFLOW.transitions.map((t) => [
    t.action,
    { from: [...t.from] as OrgApplicationStatus[], to: t.to as OrgApplicationStatus, needNote: t.needNote },
  ])
) as Record<OrgAppTransition, { from: OrgApplicationStatus[]; to: OrgApplicationStatus; needNote?: boolean }>;

/** Who is expected to act next, given the application status (§32). */
function orgAppReviewerRole(status: OrgApplicationStatus): Role | null {
  return ORG_APPLICATION_WORKFLOW.gates[status]?.role ?? null;
}

/** The filing President or Secretary of this application may act on it. */
async function requireOrgAppOfficer(organizationId: string) {
  const user = await requirePermissionOrThrow("org.submit");
  const officer = await db.organizationMember.findFirst({
    where: {
      organizationId,
      userId: user.id,
      position: { in: ["PRESIDENT", "SECRETARY"] },
      isCurrent: true,
      status: "ACTIVE",
    },
  });
  if (!officer) {
    throw new Error("Only the organization's President or Secretary can do that.");
  }
  return user;
}

/** The bound Senior Adviser (Regular Faculty) — the primary adviser. */
async function requireBoundSeniorAdviser(organizationId: string) {
  const user = await requirePermissionOrThrow("org.review");
  if (user.role !== "ADVISER_REGULAR") {
    throw new Error("Only the assigned Senior Adviser can review this application.");
  }
  const assignment = await db.adviserAssignment.findFirst({
    where: { organizationId, adviserId: user.id, type: "REGULAR", isCurrent: true },
  });
  if (!assignment) {
    throw new Error("You are not the assigned Senior Adviser of this organization.");
  }
  return user;
}

async function requireDeanInScope(organizationCollegeId: string) {
  const user = await requirePermissionOrThrow("org.approve");
  if (user.role !== "DEAN") {
    throw new Error("Only the college Dean can act at this step.");
  }
  if (user.collegeId && user.collegeId !== organizationCollegeId) {
    throw new Error("This application belongs to another college.");
  }
  return user;
}

async function requireRole(role: Role, permission: "org.approve" | "org.review") {
  const user = await requirePermissionOrThrow(permission);
  if (user.role !== role) {
    throw new Error("You do not have authority at this step.");
  }
  return user;
}

function orgAppAction(transition: OrgAppTransition) {
  return async function action(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const id = String(formData.get("id") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    const spec = ORG_APP_TRANSITIONS[transition];

    if (spec.needNote && !note) {
      return { error: "A note explaining the decision is required." };
    }

    const org = await db.organization.findUnique({
      where: { id },
      include: { college: { select: { id: true } }, advisers: true, members: { where: { isCurrent: true } } },
    });
    if (!org) return { error: "Organization not found." };

    // ---- Authorization -----------------------------------------------------
    let user;
    try {
      switch (transition) {
        case "SUBMIT": {
          user = await requireOrgAppOfficer(id);
          // Required checklist before the application can be filed: a Senior
          // Adviser (Regular) plus current-year President and Secretary must be
          // seated. Derived from the shared registry so the card and the server
          // gate cannot drift.
          const ay = currentAcademicYear();
          const officers = org.members.filter(
            (m) => m.academicYear === ay && m.status === "ACTIVE"
          );
          const gaps = orgAppSubmissionGaps(
            orgAppRequirements({
              name: org.name,
              description: org.description,
              hasSeniorAdviser: org.advisers.some((a) => a.type === "REGULAR" && a.isCurrent),
              hasPresident: officers.some((m) => m.position === "PRESIDENT"),
              hasSecretary: officers.some((m) => m.position === "SECRETARY"),
            })
          );
          if (gaps.length > 0) {
            return {
              error: `Complete the application requirements before submitting: ${gaps.map((g) => g.title).join(", ")}.`,
            };
          }
          break;
        }
        case "START_REVIEW":
        case "ADVISER_APPROVE":
          user = await requireBoundSeniorAdviser(id);
          break;
        case "DEAN_APPROVE":
          user = await requireDeanInScope(org.collegeId);
          break;
        case "SOA_APPROVE":
          user = await requireRole("SOA", "org.approve");
          break;
        case "CONFER":
          user = await requireRole("OSAS", "org.approve");
          break;
        case "REJECT":
          user = await requireRole("OSAS", "org.approve");
          break;
        case "RETURN": {
          const reviewer = orgAppReviewerRole(org.applicationStatus);
          if (reviewer === "ADVISER_REGULAR") {
            user = await requireBoundSeniorAdviser(id);
          } else if (reviewer === "DEAN") {
            user = await requireDeanInScope(org.collegeId);
          } else if (reviewer === "SOA") {
            user = await requireRole("SOA", "org.approve");
          } else if (reviewer === "OSAS") {
            user = await requireRole("OSAS", "org.approve");
          } else {
            return { error: "There is no reviewer at this step." };
          }
          break;
        }
      }
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Not authorized." };
    }

    // ---- State machine -----------------------------------------------------
    if (!spec.from.includes(org.applicationStatus)) {
      return {
        error: `Cannot do that while the application is "${org.applicationStatus
          .replaceAll("_", " ")
          .toLowerCase()}".`,
      };
    }

    const now = new Date();
    const data: {
      applicationStatus: OrgApplicationStatus;
      submittedAt?: Date;
      decidedAt?: Date;
      decidedById?: string;
      applicationRemark?: string | null;
    } = { applicationStatus: spec.to };
    if (spec.to === "SUBMITTED") data.submittedAt = now;
    if (["RECOGNIZED", "REJECTED"].includes(spec.to)) {
      data.decidedAt = now;
      data.decidedById = user!.id;
    }
    if (spec.to === "RETURNED" || spec.to === "REJECTED") {
      data.applicationRemark = note;
    }

    await db.organization.update({ where: { id }, data });

    // ---- Audit + notification ----------------------------------------------
    const auditAction: Record<OrgAppTransition, string> = {
      SUBMIT: "ORGANIZATION_SUBMITTED",
      START_REVIEW: "ORGANIZATION_REVIEWED",
      ADVISER_APPROVE: "ORGANIZATION_APPROVED",
      DEAN_APPROVE: "ORGANIZATION_APPROVED",
      SOA_APPROVE: "ORGANIZATION_APPROVED",
      CONFER: "ORGANIZATION_RECOGNIZED",
      RETURN: "ORGANIZATION_RETURNED",
      REJECT: "ORGANIZATION_REJECTED",
    };
    await writeAudit({
      userId: user!.id,
      action: auditAction[transition],
      entityType: "Organization",
      entityId: id,
      entityLabel: org.name,
      previousState: { applicationStatus: org.applicationStatus },
      newState: { applicationStatus: spec.to, note: note || undefined },
    });

    if (transition !== "SUBMIT") {
      const outcomeMap: Partial<
        Record<OrgAppTransition, { type: string; title: string }>
      > = {
        START_REVIEW: { type: "APPLICATION_UNDER_REVIEW", title: "Application review started" },
        ADVISER_APPROVE: { type: "APPLICATION_FOR_SIGNATURE", title: "Application forwarded for signature" },
        DEAN_APPROVE: { type: "APPLICATION_FOR_SIGNATURE", title: "Application forwarded for approval" },
        SOA_APPROVE: { type: "APPLICATION_FOR_APPROVAL", title: "Application recommended" },
        CONFER: { type: "RECOGNITION_CONFERRED", title: "Official recognition conferred" },
        RETURN: { type: "APPLICATION_RETURNED", title: "Application returned for revision" },
        REJECT: { type: "APPLICATION_REJECTED", title: "Application disapproved" },
      };
      const outcome = outcomeMap[transition];
      if (outcome) {
        try {
          await notifyOrgOfficers(id, {
            type: outcome.type,
            title: `${outcome.title}: ${org.name}`,
            body: [note ? `Note: ${note.slice(0, 160)}` : null].filter(Boolean).join(" · ") || "Review your organization's application.",
            link: `/organizations/${id}`,
          });
        } catch {
          // Best-effort.
        }
      }
    }

    revalidatePath(`/organizations/${id}`);
    revalidatePath("/organizations");
    revalidatePath("/dashboard");
    return { success: "Action recorded." };
  };
}

export const submitOrgApplication = orgAppAction("SUBMIT");
export const startOrgReview = orgAppAction("START_REVIEW");
export const adviserApproveApplication = orgAppAction("ADVISER_APPROVE");
export const deanApproveApplication = orgAppAction("DEAN_APPROVE");
export const soaApproveApplication = orgAppAction("SOA_APPROVE");
export const conferOrgApplication = orgAppAction("CONFER");
export const returnOrgApplication = orgAppAction("RETURN");
export const rejectOrgApplication = orgAppAction("REJECT");

// ---------------------------------------------------------------------------
// §23 (mirrored): the organization application interview stage. Reviewers
// schedule an interview and record its outcome without moving the application
// out of its current workflow status — same contract as the recognition path.
// ---------------------------------------------------------------------------

const INTERVIEW_OUTCOMES = [
  "COMPLETED",
  "FOR_ADDITIONAL_REVIEW",
  "PASSED",
  "NEEDS_REVISION",
] as const;

type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

async function assertOrgInterviewScope(id: string) {
  const user = await requireUser();
  if (!can(user, "org.review")) {
    throw new Error("Only reviewers can manage the interview stage.");
  }
  const org = await db.organization.findUnique({
    where: { id },
    include: {
      college: { select: { id: true } },
      advisers: { where: { type: "REGULAR", isCurrent: true } },
    },
  });
  if (!org) throw new Error("Organization not found.");
  if (!["SUBMITTED", "UNDER_REVIEW"].includes(org.applicationStatus)) {
    throw new Error(
      `Interviews apply only while the application is pending or under review (currently "${org.applicationStatus
        .replaceAll("_", " ")
        .toLowerCase()}").`
    );
  }
  if (user.role === "ADVISER_REGULAR" && !org.advisers.some((a) => a.adviserId === user.id)) {
    throw new Error("Only the assigned Senior Adviser can manage the interview for this organization.");
  }
  if (user.role === "DEAN" && user.collegeId && user.collegeId !== org.collegeId) {
    throw new Error("This application belongs to another college.");
  }
  return { user, org };
}

export async function scheduleOrgInterview(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const id = String(formData.get("id") ?? "");
    const when = String(formData.get("interviewAt") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    const { user, org } = await assertOrgInterviewScope(id);

    if (!when) return { error: "Pick a date and time for the interview." };
    const interviewAt = new Date(when);
    if (Number.isNaN(interviewAt.getTime())) return { error: "Invalid date/time." };

    await db.organization.update({
      where: { id },
      data: { interviewStatus: "SCHEDULED", interviewAt, interviewNotes: note || null },
    });
    await writeAudit({
      userId: user.id,
      action: "INTERVIEW_SCHEDULED",
      entityType: "Organization",
      entityId: id,
      entityLabel: org.name,
      newState: { interviewAt: interviewAt.toISOString(), note: note || undefined },
    });
    try {
      await notifyOrgOfficers(id, {
        type: "INTERVIEW_SCHEDULED",
        title: `Interview scheduled: ${org.name}`,
        body: `${formatDateTime(interviewAt)}${note ? ` · ${note.slice(0, 140)}` : ""}`,
        link: `/organizations/${id}`,
      });
    } catch {
      // Best-effort.
    }
    revalidatePath(`/organizations/${id}`);
    revalidatePath("/organizations");
    return { success: "Interview scheduled." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to schedule interview." };
  }
}

export async function recordOrgInterviewOutcome(
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

    const { user, org } = await assertOrgInterviewScope(id);
    if (org.interviewStatus === "NOT_SCHEDULED") {
      return { error: "Schedule the interview first." };
    }

    await db.organization.update({
      where: { id },
      data: { interviewStatus: outcomeKey, interviewNotes: note || org.interviewNotes },
    });
    const labels: Record<InterviewOutcome, string> = {
      COMPLETED: "Interview completed",
      FOR_ADDITIONAL_REVIEW: "Interview held — for additional review",
      PASSED: "Interview passed",
      NEEDS_REVISION: "Interview held — needs revision",
    };
    await writeAudit({
      userId: user.id,
      action: `INTERVIEW_${outcomeKey}`,
      entityType: "Organization",
      entityId: id,
      entityLabel: org.name,
      previousState: { interviewStatus: org.interviewStatus },
      newState: { interviewStatus: outcomeKey, note: note || undefined },
    });
    revalidatePath(`/organizations/${id}`);
    revalidatePath("/organizations");
    return { success: labels[outcomeKey] + "." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to record outcome." };
  }
}

// ---------------------------------------------------------------------------
// Advisers (two distinct positions - never merged, Â§7)
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
          ? "The selected account does not hold the Senior Adviser (Regular Faculty) role."
          : "The selected account does not hold the Junior Adviser (Part-Time Faculty) role.",
    };
  }

  const clash = await db.adviserAssignment.findFirst({
    where: { adviserId, academicYear, isCurrent: true },
  });
  if (clash) {
    return { error: `${adviser.firstName} ${adviser.lastName} already advises another organization for AY ${academicYear}.` };
  }

  // Â§19-Â§21 succession: assigning into an occupied slot ENDS the incumbent's
  // term (history preserved with who/when/why) and starts the successor's â€”
  // never an overwrite or delete.
  const incumbent = await db.adviserAssignment.findFirst({
    where: { organizationId, type: type as "REGULAR" | "PART_TIME", academicYear, isCurrent: true },
    include: { adviser: true },
  });
  if (incumbent?.adviserId === adviserId) {
    return { error: `${adviser.firstName} ${adviser.lastName} already holds this position for AY ${academicYear}.` };
  }

  // Re-appointing someone whose earlier term was ended revives that record
  // instead of inserting a duplicate (the unique constraint spans history).
  const priorTerm = await db.adviserAssignment.findFirst({
    where: { organizationId, adviserId, type: type as "REGULAR" | "PART_TIME", academicYear },
  });

  try {
    await db.$transaction(async (tx) => {
      if (incumbent) {
        await tx.adviserAssignment.update({
          where: { id: incumbent.id },
          data: {
            isCurrent: false,
            endedAt: new Date(),
            endedById: user.id,
            endReason: "REPLACED",
          },
        });
      }
      if (priorTerm) {
        await tx.adviserAssignment.update({
          where: { id: priorTerm.id },
          data: { isCurrent: true, endedAt: null, endedById: null, endReason: null },
        });
      } else {
        await tx.adviserAssignment.create({
          data: { organizationId, adviserId, type: type as "REGULAR" | "PART_TIME", academicYear },
        });
      }
    });
  } catch {
    return {
      error: `This organization already has a ${
        type === "REGULAR" ? "Senior Adviser (Regular Faculty)" : "Junior Adviser (Part-Time Faculty)"
      } for AY ${academicYear}.`,
    };
  }

  const auditAction = priorTerm
    ? "ADVISER_REAPPOINTED"
    : incumbent
      ? "ADVISER_SUCCEEDED"
      : "ADVISER_ASSIGNED";
  await writeAudit({
    userId: user.id,
    action: auditAction,
    entityType: "Organization",
    entityId: organizationId,
    entityLabel: org.name,
    previousState: incumbent
      ? { adviser: `${incumbent.adviser.firstName} ${incumbent.adviser.lastName}`, type, academicYear }
      : undefined,
    newState: { adviserId, adviser: `${adviser.firstName} ${adviser.lastName}`, type, academicYear },
  });
  revalidatePath(`/organizations/${organizationId}`);
  return incumbent
    ? { success: `Adviser updated â€” ${incumbent.adviser.lastName}'s term was ended and kept in history.` }
    : { success: "Adviser assigned." };
}

/** Â§20: ending a term keeps the assignment row forever (who/when/why). */
export async function endAdviserTerm(formData: FormData): Promise<void> {
  const user = await requirePermissionOrThrow("org.manage");
  const assignmentId = String(formData.get("assignmentId") ?? "");

  const assignment = await db.adviserAssignment.findUnique({
    where: { id: assignmentId },
    include: { adviser: true, organization: true },
  });
  if (!assignment || !assignment.isCurrent) return;

  await db.adviserAssignment.update({
    where: { id: assignmentId },
    data: {
      isCurrent: false,
      endedAt: new Date(),
      endedById: user.id,
      endReason: "ENDED_WITHOUT_SUCCESSOR",
    },
  });
  await writeAudit({
    userId: user.id,
    action: "ADVISER_TERM_ENDED",
    entityType: "Organization",
    entityId: assignment.organizationId,
    entityLabel: assignment.organization.name,
    previousState: {
      adviser: `${assignment.adviser.firstName} ${assignment.adviser.lastName}`,
      type: assignment.type,
      academicYear: assignment.academicYear,
    },
    newState: { endReason: "ENDED_WITHOUT_SUCCESSOR" },
  });
  revalidatePath(`/organizations/${assignment.organizationId}`);
}

// ---------------------------------------------------------------------------
// Members & officers
// ---------------------------------------------------------------------------

/**
 * Officers (President/Secretary with an APPROVED current membership) may run
 * their own organization's member operations; admins need org.manage. This is
 * the Â§28 ownership check â€” role alone never grants access to another org.
 */
async function requireOrgOfficerOrAdmin(organizationId: string) {
  const user = await requirePermissionOrThrow("org.view");
  if (can(user, "org.manage")) return user;
  const officer = await db.organizationMember.findFirst({
    where: {
      organizationId,
      userId: user.id,
      position: { in: ["PRESIDENT", "SECRETARY"] },
      isCurrent: true,
      status: "ACTIVE",
    },
  });
  if (!officer) throw new Error("Only organization officers or administrators can do that.");
  return user;
}

/** Live student search for the SF-005-style member picker (Â§14). */
export async function searchStudents(params: {
  organizationId: string;
  academicYear: string;
  q?: string;
}): Promise<
  { id: string; name: string; studentNumber: string | null; department: string | null }[]
> {
  await requireOrgOfficerOrAdmin(params.organizationId);
  const q = (params.q ?? "").trim();

  const existing = await db.organizationMember.findMany({
    where: { organizationId: params.organizationId, academicYear: params.academicYear },
    select: { userId: true },
  });
  const exclude = existing.map((e) => e.userId);

  const rows = await db.user.findMany({
    where: {
      isActive: true,
      id: { notIn: exclude },
      role: { in: ["MEMBER", "PRESIDENT", "SECRETARY"] },
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { studentNumber: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      studentNumber: true,
      department: { select: { name: true } },
    },
    orderBy: { lastName: "asc" },
    take: 25,
  });

  return rows.map((u) => ({
    id: u.id,
    name: `${u.firstName}${u.middleName ? ` ${u.middleName}` : ""} ${u.lastName}`.trim(),
    studentNumber: u.studentNumber,
    department: u.department?.name ?? null,
  }));
}

/** Bulk-add selected students as APPROVED members (Â§13). */
export async function addMembersBulk(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const organizationId = String(formData.get("organizationId") ?? "");
    const academicYear = String(formData.get("academicYear") ?? currentAcademicYear());
    const userIds = formData.getAll("userIds").map(String).filter(Boolean);

    if (!organizationId || userIds.length === 0) {
      return { error: "Select at least one student." };
    }
    if (userIds.length > 200) return { error: "Too many students selected." };

    await requireOrgOfficerOrAdmin(organizationId);

    const org = await db.organization.findUnique({ where: { id: organizationId } });
    if (!org) return { error: "Organization not found." };

    const validUsers = await db.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true, firstName: true, lastName: true },
    });
    if (validUsers.length === 0) return { error: "No valid active students in selection." };

    // One position per row defaults to MEMBER; officers are set individually.
    const created = await db.$transaction(
      async (tx) => {
        let count = 0;
        for (const u of validUsers) {
          const exists = await tx.organizationMember.findUnique({
            where: {
              organizationId_userId_academicYear: {
                organizationId,
                userId: u.id,
                academicYear,
              },
            },
          });
          if (!exists) {
            await tx.organizationMember.create({
              data: {
                organizationId,
                userId: u.id,
                position: "MEMBER",
                status: "ACTIVE",
                academicYear,
                decidedAt: new Date(),
                decidedById: user.id,
              },
            });
            count++;
          }
        }
        return count;
      }
    );

    await writeAudit({
      userId: user.id,
      action: "MEMBERS_BULK_ADDED",
      entityType: "Organization",
      entityId: organizationId,
      entityLabel: org.name,
      newState: { added: created, requested: validUsers.length, academicYear },
    });
    revalidatePath(`/organizations/${organizationId}`);
    revalidatePath("/forms/sf-005");
    return {
      success:
        created === validUsers.length
          ? `Added ${created} member${created === 1 ? "" : "s"}.`
          : `Added ${created}; ${validUsers.length - created} already registered.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add members." };
  }
}

/** Â§15: a student requests to join an organization; officers or admins review it. */
export async function applyForMembership(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const organizationId = String(formData.get("organizationId") ?? "");
    const ay = String(formData.get("academicYear") ?? currentAcademicYear());
    if (!organizationId) return { error: "Missing organization." };
    if (!["MEMBER", "PRESIDENT", "SECRETARY"].includes(user.role)) {
      return { error: "Only student accounts can apply for membership." };
    }

    const org = await db.organization.findUnique({ where: { id: organizationId } });
    if (!org || org.status !== "ACTIVE") {
      return { error: "Organization not found or not active." };
    }

    const existing = await db.organizationMember.findUnique({
      where: {
        organizationId_userId_academicYear: { organizationId, userId: user.id, academicYear: ay },
      },
    });
    if (existing) {
      return {
        error:
          existing.status === "APPLIED"
            ? "Your application is already awaiting review."
            : "You are already registered for this academic year.",
      };
    }

    await db.organizationMember.create({
      data: {
        organizationId,
        userId: user.id,
        position: "MEMBER",
        status: "APPLIED",
        academicYear: ay,
      },
    });
    await writeAudit({
      userId: user.id,
      action: "MEMBERSHIP_APPLIED",
      entityType: "Organization",
      entityId: organizationId,
      entityLabel: org.name,
      newState: { academicYear: ay },
    });
    revalidatePath(`/organizations/${organizationId}`);
    return { success: "Application submitted. The organization's officers will review it." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to submit application." };
  }
}

/** Â§24: replace an officer for the year â€” one President / one Secretary each. */
export async function setMemberPosition(formData: FormData): Promise<void> {
  const membershipId = String(formData.get("membershipId") ?? "");
  const position = String(formData.get("position") ?? "");
  if (!["MEMBER", "PRESIDENT", "SECRETARY"].includes(position)) return;
  const nextPosition = position as "MEMBER" | "PRESIDENT" | "SECRETARY";

  const membership = await db.organizationMember.findUnique({
    where: { id: membershipId },
    include: { user: true, organization: true },
  });
  if (!membership || !membership.isCurrent) return;
  const user = await requireOrgOfficerOrAdmin(membership.organizationId);
  if (membership.position === position) return;

  const ay = membership.academicYear;
  await db.$transaction(async (tx) => {
    // If another member holds the target position, demote them to MEMBER â€”
    // the swap is recorded in the audit log, the roster history stays intact.
    const incumbent = await tx.organizationMember.findFirst({
      where: {
        organizationId: membership.organizationId,
        academicYear: ay,
        isCurrent: true,
        position: nextPosition,
      },
    });
    if (incumbent && incumbent.id !== membership.id) {
      await tx.organizationMember.update({
        where: { id: incumbent.id },
        data: { position: "MEMBER" },
      });
    }
    await tx.organizationMember.update({
      where: { id: membership.id },
      data: { position: nextPosition },
    });
  });

  await writeAudit({
    userId: user.id,
    action: "OFFICER_POSITION_CHANGED",
    entityType: "Organization",
    entityId: membership.organizationId,
    entityLabel: membership.organization.name,
    previousState: {
      member: `${membership.user.firstName} ${membership.user.lastName}`,
      position: membership.position,
      academicYear: ay,
    },
    newState: {
      member: `${membership.user.firstName} ${membership.user.lastName}`,
      position,
      academicYear: ay,
    },
  });
  revalidatePath(`/organizations/${membership.organizationId}`);
}

/** §15: officer/admin approves or rejects a pending membership application. */
export async function decideMembership(formData: FormData): Promise<void> {
  const membershipId = String(formData.get("membershipId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!["APPROVED", "REJECTED"].includes(decision)) return;

  const membership = await db.organizationMember.findUnique({
    where: { id: membershipId },
    include: { organization: true, user: true },
  });
  if (!membership || membership.status !== "APPLIED") return;
  const user = await requireOrgOfficerOrAdmin(membership.organizationId);

  const nextStatus = decision === "APPROVED" ? "ACTIVE" : "REJECTED";
  await db.organizationMember.update({
    where: { id: membershipId },
    data: {
      status: nextStatus as "ACTIVE" | "REJECTED",
      decidedAt: new Date(),
      decidedById: user.id,
    },
  });
  await writeAudit({
    userId: user.id,
    action: "MEMBERSHIP_REVIEWED",
    entityType: "Organization",
    entityId: membership.organizationId,
    entityLabel: membership.organization.name,
    previousState: { status: "APPLIED", member: `${membership.user.firstName} ${membership.user.lastName}` },
    newState: { status: nextStatus, member: `${membership.user.firstName} ${membership.user.lastName}`, academicYear: membership.academicYear },
  });
  revalidatePath(`/organizations/${membership.organizationId}`);
}

/** Officer moves an application from APPLIED to UNDER_REVIEW. */
export async function reviewMembership(formData: FormData): Promise<void> {
  const membershipId = String(formData.get("membershipId") ?? "");
  const membership = await db.organizationMember.findUnique({
    where: { id: membershipId },
    include: { organization: true, user: true },
  });
  if (!membership || membership.status !== "APPLIED") return;
  const user = await requireOrgOfficerOrAdmin(membership.organizationId);

  await db.organizationMember.update({
    where: { id: membershipId },
    data: { status: "UNDER_REVIEW" },
  });
  await writeAudit({
    userId: user.id,
    action: "MEMBERSHIP_REVIEWED",
    entityType: "Organization",
    entityId: membership.organizationId,
    entityLabel: membership.organization.name,
    previousState: { status: "APPLIED", member: `${membership.user.firstName} ${membership.user.lastName}` },
    newState: { status: "UNDER_REVIEW", academicYear: membership.academicYear },
  });
  revalidatePath(`/organizations/${membership.organizationId}`);
}

/** Officer/admin deactivates an ACTIVE membership (sets INACTIVE). */
export async function deactivateMembership(formData: FormData): Promise<void> {
  const membershipId = String(formData.get("membershipId") ?? "");
  const membership = await db.organizationMember.findUnique({
    where: { id: membershipId },
    include: { organization: true, user: true },
  });
  if (!membership || membership.status !== "ACTIVE") return;
  const user = await requireOrgOfficerOrAdmin(membership.organizationId);

  await db.organizationMember.update({
    where: { id: membershipId },
    data: { status: "INACTIVE" },
  });
  await writeAudit({
    userId: user.id,
    action: "MEMBERSHIP_DEACTIVATED",
    entityType: "Organization",
    entityId: membership.organizationId,
    entityLabel: membership.organization.name,
    previousState: { status: "ACTIVE", member: `${membership.user.firstName} ${membership.user.lastName}` },
    newState: { status: "INACTIVE", academicYear: membership.academicYear },
  });
  revalidatePath(`/organizations/${membership.organizationId}`);
}

export async function addMember(_prev: ActionState, formData: FormData): Promise<ActionState> {  const organizationId = String(formData.get("organizationId") ?? "");
  const user = await requireOrgOfficerOrAdmin(organizationId);

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
  const membershipId = String(formData.get("membershipId") ?? "");

  const membership = await db.organizationMember.findUnique({
    where: { id: membershipId },
    include: { user: true, organization: true },
  });
  if (!membership) return;
  const user = await requireOrgOfficerOrAdmin(membership.organizationId);

  await db.organizationMember.update({
    where: { id: membershipId },
    data: { status: "REMOVED" },
  });
  await writeAudit({
    userId: user.id,
    action: "MEMBERSHIP_REMOVED",
    entityType: "Organization",
    entityId: membership.organizationId,
    entityLabel: membership.organization.name,
    previousState: {
      member: `${membership.user.firstName} ${membership.user.lastName}`,
      position: membership.position,
      status: membership.status,
      academicYear: membership.academicYear,
    },
    newState: { status: "REMOVED" },
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
