"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermissionOrThrow, requireUser } from "@/lib/auth/guards";
import { can, isAdminRole } from "@/lib/auth/rbac";
import type { AuthUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { notifyOrgAdvisers, notifyOrgOfficers, notifyUsers } from "@/lib/notifications";
import {
  deleteAttachmentFile,
  newStoredName,
  saveAttachmentFile,
  validateFile,
} from "@/lib/attachments";
import { SIGNATORY_LABELS } from "@/lib/form-routes";
import { deadlineAppliesToOrg } from "@/lib/deadlines";
import {
  deadlineProcessesForFinancial,
  derivedFinancialStatus,
  financialSigningRoles,
  isFinancialEditable,
  isFinancialFileKind,
} from "@/lib/financial";
import type {
  FinancialSubmission,
  OrgType,
  SignatoryRole,
} from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Part 12 - Financial compliance server actions. Every mutation is audited and
// revalidates the org financial workspace plus the campus-wide /financial
// overview. Signature steps themselves are handled by the shared
// signature-route actions; this module supplies the org-side upload/submit,
// the administrator-side requirements/config, and the status sync hook.
// ---------------------------------------------------------------------------

export type FinancialActionState = { error?: string; ok?: string };

const ENTITY_TYPE = "FinancialSubmission";

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function orgFinancialPath(orgId: string) {
  return `/organizations/${orgId}/financial`;
}

function fullRevalidate(orgId: string) {
  revalidatePath(orgFinancialPath(orgId));
  revalidatePath("/financial");
}

type SubmissionDetail = FinancialSubmission & {
  organization: {
    id: string;
    name: string;
    type: OrgType;
    collegeId: string | null;
  };
  requirement: {
    code: string;
    name: string;
    process: string;
  };
};

async function loadSubmission(submissionId: string): Promise<SubmissionDetail | null> {
  return db.financialSubmission.findUnique({
    where: { id: submissionId },
    include: {
      organization: { select: { id: true, name: true, type: true, collegeId: true } },
      requirement: { select: { code: true, name: true, process: true } },
    },
  }) as Promise<SubmissionDetail | null>;
}

/** President or Secretary of the org (current officer, this academic year). */
async function isOrgOfficer(userId: string, organizationId: string): Promise<boolean> {
  const membership = await db.organizationMember.findFirst({
    where: {
      organizationId,
      userId,
      isCurrent: true,
      position: { in: ["PRESIDENT", "SECRETARY"] },
    },
    select: { id: true },
  });
  return Boolean(membership);
}

/** Connected to the org: member, current adviser, college dean, or admin. */
async function canAccessOrg(user: AuthUser, organizationId: string): Promise<boolean> {
  if (can(user, "org.manage")) return true;
  if (user.role === "DEAN") {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { collegeId: true },
    });
    return org?.collegeId != null && org.collegeId === user.collegeId;
  }
  if (user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME") {
    const assignment = await db.adviserAssignment.findFirst({
      where: { adviserId: user.id, organizationId, isCurrent: true },
      select: { id: true },
    });
    if (assignment) return true;
  }
  const membership = await db.organizationMember.findFirst({
    where: { userId: user.id, organizationId, isCurrent: true },
    select: { id: true },
  });
  return Boolean(membership);
}

async function pickFinancialDeadline(
  orgType: OrgType,
  collegeId: string | null,
  ay: string,
  process: string
) {
  const processes = deadlineProcessesForFinancial(process);
  const deadlines = await db.deadline.findMany({
    where: {
      academicYear: ay,
      isActive: true,
      process: { in: processes as never },
    },
    orderBy: { dueDate: "asc" },
  });
  return (
    deadlines.find((d) => deadlineAppliesToOrg(d, { type: orgType, collegeId: collegeId ?? "" })) ?? null
  );
}

async function notifyReviewers(submission: SubmissionDetail) {
  const orgId = submission.organization.id;
  const link = orgFinancialPath(orgId);
  await notifyOrgAdvisers(orgId, {
    type: "FINANCIAL_SUBMITTED",
    title: `${submission.organization.name} — ${submission.requirement.name} submitted`,
    body: `Ready for review and signature.`,
    link,
  });
  const college = await db.college.findFirst({
    where: { organizations: { some: { id: orgId } } },
    select: { deanId: true },
  });
  const office = await db.user.findMany({
    where: { role: { in: ["SOA", "OSAS"] }, isActive: true },
    select: { id: true },
  });
  await notifyUsers(
    [...(college?.deanId ? [college.deanId] : []), ...office.map((u) => u.id)],
    {
      type: "FINANCIAL_SUBMITTED",
      title: `${submission.organization.name} — ${submission.requirement.name} submitted`,
      body: `Financial submission awaiting signature from ${submission.organization.name}.`,
      link,
    }
  );
}

// ---------------------------------------------------------------------------
// Requirement configuration (OSAS/SOA)
// ---------------------------------------------------------------------------

const VALID_SIGNERS = Object.keys(SIGNATORY_LABELS) as SignatoryRole[];

export async function createFinancialRequirement(
  _prev: FinancialActionState,
  formData: FormData
): Promise<FinancialActionState> {
  try {
    const user = await requirePermissionOrThrow("financial.manage");
    const code = String(formData.get("code") ?? "").trim().toUpperCase().replace(/\s+/g, "_");
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const process = String(formData.get("process") ?? "");
    const signers = formData
      .getAll("signers")
      .map((v) => String(v)) as SignatoryRole[];
    const validSigners = signers.filter((s) => VALID_SIGNERS.includes(s));

    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code) || !code) return { error: "Use a short uppercase code (e.g. FINANCIAL_REPORT)." };
    if (name.length < 3 || name.length > 160) return { error: "Name must be 3–160 characters." };
    if (!["RECOGNITION", "RENEWAL", "ACTIVITY", "OTHER"].includes(process)) return { error: "Invalid process." };
    if (validSigners.length === 0) return { error: "Pick at least one signatory step." };

    const existing = await db.financialRequirement.findUnique({ where: { code } });
    if (existing) return { error: `Requirement "${code}" already exists.` };

    await db.financialRequirement.create({
      data: { code, name, description, process: process as never, signers: validSigners, createdById: user.id },
    });
    await writeAudit({ userId: user.id, action: "FINANCIAL_REQUIREMENT_CREATED", entityType: "FinancialRequirement", entityLabel: name, newState: { code, name, process, signers: validSigners } });
    revalidatePath("/financial/requirements");
    revalidatePath("/financial");
    return { ok: `Requirement "${name}" created.` };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function toggleFinancialRequirement(
  _prev: FinancialActionState,
  formData: FormData
): Promise<FinancialActionState> {
  try {
    const user = await requirePermissionOrThrow("financial.manage");
    const id = String(formData.get("id") ?? "");
    const requirement = await db.financialRequirement.findUnique({ where: { id } });
    if (!requirement) return { error: "Requirement not found." };
    if (requirement.isActive) {
      const open = await db.financialSubmission.count({
        where: { requirementId: id, status: { in: ["DRAFT", "INCOMPLETE", "SUBMITTED", "UNDER_REVIEW", "RESUBMITTED"] } },
      });
      if (open > 0) return { error: `Deactivate after "${open}" open submission(s) are settled, or archive them first.` };
    }
    await db.financialRequirement.update({ where: { id }, data: { isActive: !requirement.isActive } });
    await writeAudit({ userId: user.id, action: requirement.isActive ? "FINANCIAL_REQUIREMENT_DEACTIVATED" : "FINANCIAL_REQUIREMENT_ACTIVATED", entityType: "FinancialRequirement", entityId: id, entityLabel: requirement.name });
    revalidatePath("/financial/requirements");
    revalidatePath("/financial");
    return { ok: "Requirement updated." };
  } catch (e) {
    return { error: msg(e) };
  }
}

// ---------------------------------------------------------------------------
// Org-side files & submission
// ---------------------------------------------------------------------------

export async function uploadFinancialFile(
  _prev: FinancialActionState,
  formData: FormData
): Promise<FinancialActionState> {
  try {
    const user = await requireUser();
    if (user.isViewOnly) return { error: "View-only accounts cannot upload files." };
    const submissionId = String(formData.get("submissionId") ?? "");
    const purpose = String(formData.get("purpose") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
    if (!isFinancialFileKind(purpose)) return { error: "Invalid file role." };

    const submission = await loadSubmission(submissionId);
    if (!submission) return { error: "Submission not found." };
    if (!isFinancialEditable(submission.status)) return { error: "This submission is no longer editable." };
    if (!(isAdminRole(user.role as never) || (await isOrgOfficer(user.id, submission.organizationId)))) {
      return { error: "Only the organization's President or Secretary can manage financial files." };
    }

    const fileError = validateFile(file.type, file.size);
    if (fileError) return { error: fileError };

    const bytes = Buffer.from(await file.arrayBuffer());
    const storedName = newStoredName(file.type);
    await saveAttachmentFile(storedName, bytes);
    await db.attachment.create({
      data: {
        entityType: ENTITY_TYPE,
        entityId: submissionId,
        fileName: file.name,
        storedName,
        mimeType: file.type,
        sizeBytes: file.size,
        kind: purpose as never,
        version: submission.version,
        uploadedById: user.id,
      },
    });
    if (submission.status === "DRAFT") {
      await db.financialSubmission.update({ where: { id: submissionId }, data: { status: "INCOMPLETE" } });
    }
    await writeAudit({ userId: user.id, action: "FINANCIAL_FILE_UPLOADED", entityType: ENTITY_TYPE, entityId: submissionId, entityLabel: submission.requirement.name, previousState: { status: submission.status }, newState: { fileName: file.name, purpose, version: submission.version } });
    fullRevalidate(submission.organizationId);
    return { ok: "File uploaded." };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function deleteFinancialFile(formData: FormData): Promise<void> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const attachment = await db.attachment.findUnique({ where: { id } });
    if (!attachment || attachment.entityType !== ENTITY_TYPE) return;
    const submission = await loadSubmission(attachment.entityId);
    if (!submission) return;
    if (!isFinancialEditable(submission.status)) return;
    const isAdmin = isAdminRole(user.role as never);
    const isUploader = attachment.uploadedById === user.id && (await isOrgOfficer(user.id, submission.organizationId));
    if (!isAdmin && !isUploader) return;

    await deleteAttachmentFile(attachment.storedName);
    await db.attachment.delete({ where: { id } });
    await writeAudit({ userId: user.id, action: "FINANCIAL_FILE_DELETED", entityType: ENTITY_TYPE, entityId: submission.id, entityLabel: submission.requirement.name, previousState: { fileName: attachment.fileName } });
    fullRevalidate(submission.organizationId);
  } catch {
    // Best-effort concordant with the confirmation-style form that invokes it.
  }
}

export async function submitFinancialRequirement(
  _prev: FinancialActionState,
  formData: FormData
): Promise<FinancialActionState> {
  try {
    const user = await requireUser();
    const submissionId = String(formData.get("submissionId") ?? "");
    const submission = await loadSubmission(submissionId);
    if (!submission) return { error: "Submission not found." };
    if (!isFinancialEditable(submission.status)) return { error: "This submission is not awaiting submission." };
    if (!(isAdminRole(user.role as never) || (await isOrgOfficer(user.id, submission.organizationId)))) {
      return { error: "Only the organization's President or Secretary can submit." };
    }

    const route = await db.signatureRoute.findUnique({
      where: { entityType_entityId: { entityType: ENTITY_TYPE, entityId: submissionId } },
    });
    if (route && route.state !== "RETURNED_FOR_REVISION") return { error: "This submission is already routed for signatures." };

    const mainDocs = await db.attachment.findMany({
      where: { entityType: ENTITY_TYPE, entityId: submissionId, kind: "FINANCIAL_DOCUMENT", version: submission.version },
    });
    if (mainDocs.length === 0) return { error: "Attach the required financial document before submitting." };

    const roles = financialSigningRoles(submission.requirement as never);
    const deadline = submission.deadlineId
      ? null
      : await pickFinancialDeadline(submission.organization.type, submission.organization.collegeId, submission.academicYear, submission.requirement.process);

    await db.$transaction(async (tx) => {
      await tx.signatureRoute.create({
        data: {
          entityType: ENTITY_TYPE,
          entityId: submissionId,
          formKey: submission.requirement.code,
          title: submission.requirement.name,
          createdById: user.id,
          state: "IN_PROGRESS",
          version: 1,
          steps: {
            create: roles.map((role, i) => ({
              order: i + 1,
              role,
              status: i === 0 ? ("CURRENT" as const) : ("LOCKED" as const),
            })),
          },
        },
      });
      await tx.financialSubmission.update({
        where: { id: submissionId },
        data: { status: "SUBMITTED", submittedAt: new Date(), resubmittedAt: null, ...(deadline ? { deadlineId: deadline.id } : {}) },
      });
    });

    await writeAudit({ userId: user.id, action: "FINANCIAL_SUBMITTED", entityType: ENTITY_TYPE, entityId: submissionId, entityLabel: submission.requirement.name, previousState: { status: submission.status }, newState: { status: "SUBMITTED", version: 1 } });
    await notifyReviewers(submission);
    fullRevalidate(submission.organizationId);
    return { ok: `Submitted for signature — ${roles[0] ? `${roles[0]}` : ""} step is now current.` };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function startFinancialDraft(
  _prev: FinancialActionState,
  formData: FormData
): Promise<FinancialActionState> {
  try {
    const user = await requireUser();
    const organizationId = String(formData.get("organizationId") ?? "");
    const requirementId = String(formData.get("requirementId") ?? "");
    const ay = String(formData.get("academicYear") ?? "");
    if (!organizationId || !requirementId || !ay) return { error: "Missing submission details." };
    if (!isAdminRole(user.role as never) && !(await isOrgOfficer(user.id, organizationId))) {
      return { error: "Only the organization's President or Secretary can start a filing." };
    }
    const requirement = await db.financialRequirement.findUnique({ where: { id: requirementId } });
    if (!requirement || !requirement.isActive) return { error: "Requirement is not active." };
    const existing = await db.financialSubmission.findUnique({
      where: { organizationId_academicYear_requirementId: { organizationId, academicYear: ay, requirementId } },
    });
    if (existing) return { error: "A draft for this requirement already exists." };

    await db.financialSubmission.create({
      data: { organizationId, requirementId, academicYear: ay, createdById: user.id },
    });
    await writeAudit({ userId: user.id, action: "FINANCIAL_DRAFT_STARTED", entityType: ENTITY_TYPE, entityLabel: requirement.name, newState: { organizationId, academicYear: ay } });
    fullRevalidate(organizationId);
    return { ok: "Filing draft created — attach the required document." };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function archiveFinancialSubmission(
  _prev: FinancialActionState,
  formData: FormData
): Promise<FinancialActionState> {
  try {
    const user = await requirePermissionOrThrow("financial.manage");
    const submissionId = String(formData.get("submissionId") ?? "");
    const submission = await loadSubmission(submissionId);
    if (!submission) return { error: "Submission not found." };
    const route = await db.signatureRoute.findUnique({
      where: { entityType_entityId: { entityType: ENTITY_TYPE, entityId: submissionId } },
      select: { state: true },
    });
    if (!route || route.state !== "COMPLETED") return { error: "Only fully signed submissions can be archived." };

    await db.financialSubmission.update({
      where: { id: submissionId },
      data: { status: "ARCHIVED", archivedAt: new Date(), archivedById: user.id },
    });
    await writeAudit({ userId: user.id, action: "FINANCIAL_ARCHIVED", entityType: ENTITY_TYPE, entityId: submissionId, entityLabel: submission.requirement.name, previousState: { status: submission.status }, newState: { status: "ARCHIVED" } });
    await notifyOrgOfficers(submission.organizationId, {
      type: "FINANCIAL_ARCHIVED",
      title: `${submission.requirement.name} archived`,
      body: "OSAS has archived the completed financial submission.",
      link: orgFinancialPath(submission.organizationId),
    });
    fullRevalidate(submission.organizationId);
    return { ok: "Submission archived." };
  } catch (e) {
    return { error: msg(e) };
  }
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addFinancialComment(
  _prev: FinancialActionState,
  formData: FormData
): Promise<FinancialActionState> {
  try {
    const user = await requireUser();
    const submissionId = String(formData.get("submissionId") ?? "");
    const body = String(formData.get("body") ?? "").trim();
    if (body.length < 2 || body.length > 2000) return { error: "Comment must be 2–2000 characters." };
    const submission = await loadSubmission(submissionId);
    if (!submission) return { error: "Submission not found." };
    if (!(await canAccessOrg(user, submission.organizationId))) return { error: "You do not have access to this organization's finances." };

    await db.financialComment.create({
      data: { submissionId, authorId: user.id, body },
    });
    await writeAudit({ userId: user.id, action: "FINANCIAL_COMMENT_ADDED", entityType: ENTITY_TYPE, entityId: submissionId, entityLabel: submission.requirement.name, newState: { body } });
    const orgId = submission.organizationId;
    const link = orgFinancialPath(orgId);
    await notifyOrgOfficersAndAdvisersExcept(orgId, user.id, {
      type: "FINANCIAL_COMMENT",
      title: `New comment on ${submission.requirement.name}`,
      body,
      link,
    });
    fullRevalidate(orgId);
    return { ok: "Comment added." };
  } catch (e) {
    return { error: msg(e) };
  }
}

async function notifyOrgOfficersAndAdvisersExcept(
  organizationId: string,
  exceptUserId: string,
  payload: { type: string; title: string; body?: string; link?: string }
) {
  const [members, advisers] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId, isCurrent: true },
      select: { userId: true },
    }),
    db.adviserAssignment.findMany({
      where: { organizationId, isCurrent: true },
      select: { adviserId: true },
    }),
  ]);
  const ids = [...new Set([...members.map((m) => m.userId), ...advisers.map((a) => a.adviserId)])].filter(
    (id) => id !== exceptUserId
  );
  await notifyUsers(ids, payload);
}

// ---------------------------------------------------------------------------
// Status sync hook (called by the shared signature actions when the routed
// entity is a FinancialSubmission) - keeps the persisted §13 status truthful.
// ---------------------------------------------------------------------------

export async function syncFinancialSubmission(params: {
  entityType: string;
  entityId: string;
}): Promise<void> {
  if (params.entityType !== ENTITY_TYPE) return;
  try {
    const sub = await db.financialSubmission.findUnique({
      where: { id: params.entityId },
      include: { organization: { select: { id: true } } },
    });
    if (!sub) return;
    const route = await db.signatureRoute.findUnique({
      where: { entityType_entityId: { entityType: ENTITY_TYPE, entityId: params.entityId } },
      include: { steps: true },
    });
    if (!route) return;

    const status = derivedFinancialStatus({
      routeState: route.state,
      version: route.version,
      steps: route.steps.map((s) => ({ role: s.role, status: s.status })),
      persistRef: { resubmittedAt: sub.resubmittedAt, archivedAt: sub.archivedAt },
    });

    const data: Partial<FinancialSubmission> = { status: status as never };
    if (status === "APPROVED" && sub.status !== "APPROVED") {
      const lastSigned = [...route.steps]
        .sort((a, b) => b.order - a.order)
        .find((s) => s.status === "SIGNED");
      data.decidedAt = new Date();
      data.decidedById = lastSigned?.signerId ?? null;
    }
    if (sub.version !== route.version) data.version = route.version;

    if (status !== sub.status || sub.version !== route.version) {
      await db.financialSubmission.update({ where: { id: sub.id }, data });
      const orgPath = orgFinancialPath(sub.organizationId);
      if (status === "RETURNED") {
        await notifyOrgOfficers(sub.organizationId, {
          type: "FINANCIAL_RETURNED",
          title: "Financial submission returned for revision",
          body: `A reviewer returned a submission for ${sub.id}. Correct the documents and resubmit.`,
          link: orgPath,
        });
      } else if (status === "APPROVED" && sub.status !== "APPROVED") {
        await notifyOrgOfficers(sub.organizationId, {
          type: "FINANCIAL_APPROVED",
          title: "Financial submission approved",
          link: orgPath,
        });
      }
      revalidatePath(orgPath);
      revalidatePath("/financial");
    }
  } catch {
    // Sync is best-effort: the authoritative route state still stands.
  }
}