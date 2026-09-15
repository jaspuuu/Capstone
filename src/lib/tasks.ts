import { db } from "@/lib/db";
import { scopedOrgWhere } from "@/lib/auth/rbac";
import { currentAcademicYear } from "@/lib/utils";
import {
  FORM_META,
  SIGNATURE_FORM_ORDER,
  sfRouteEntityId,
} from "@/lib/form-routes";
import { resolveSigners, type OrgContext } from "@/lib/signature-policy";
import {
  deadlineAppliesToOrg,
  deadlineStatus,
  listActiveDeadlines,
} from "@/lib/deadlines";
import type { Role, SignatoryRole } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// My Tasks — a single, per-user list of the next things that are actually
// waiting on THIS person, spread across the organizations they can act on.
// The policy (signature-policy.ts) stays the only source of truth for who may
// act; this module only READS route state and membership through that lens.
// ---------------------------------------------------------------------------

export type TaskType = "SIGNATURE" | "RESUBMIT" | "DEADLINE";

export type MyTask = {
  type: TaskType;
  formKey: string;
  formCode: string; // "SF-004"
  formTitle: string; // "Plan of Activities"
  orgId: string;
  orgName: string;
  orgAcronym: string | null;
  ay: string;
  routeId?: string;
  version?: number;
  requiredRole?: SignatoryRole; // awaited role for the SIGNATURE/RESUBMIT step
  detail: string;
  href: string;
  priority: "high" | "low";
  dueAt?: Date;
};

type UserView = { id: string; role: Role; collegeId: string | null };

export async function getMyTasks(
  user: UserView,
  opts: { orgId?: string } = {}
): Promise<MyTask[]> {
  const orgs = await db.organization.findMany({
    where: scopedOrgWhere(user, opts.orgId ? { id: opts.orgId } : {}),
    select: { id: true, name: true, acronym: true, collegeId: true, type: true },
  });
  if (orgs.length === 0) return [];

  const ay = currentAcademicYear();
  const entityIds = orgs.flatMap((o) =>
    SIGNATURE_FORM_ORDER.map((fk) => sfRouteEntityId(fk, o.id, ay))
  );

  const routes = await db.signatureRoute.findMany({
    where: {
      entityType: "SF",
      entityId: { in: entityIds },
      state: { in: ["IN_PROGRESS", "RETURNED_FOR_REVISION"] },
    },
    include: { steps: { orderBy: { order: "asc" as const } } },
  });

  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const tasks: MyTask[] = [];

  for (const route of routes) {
    const [formKey, orgId, routeAy] = route.entityId.split(":");
    const org = orgById.get(orgId);
    if (!org || routeAy !== ay) continue;
    const orgCtx: OrgContext = { id: org.id, collegeId: org.collegeId, academicYear: routeAy };
    const meta = FORM_META[formKey as keyof typeof FORM_META];
    if (!meta) continue;
    const href = `${meta.href}?org=${org.id}&ay=${routeAy}`;

    if (route.state === "IN_PROGRESS") {
      const currentStep = route.steps.find((s) => s.status === "CURRENT");
      if (!currentStep) continue;
      const eligible = await resolveSigners(currentStep.role, orgCtx);
      if (!eligible.includes(user.id)) continue;
      tasks.push({
        type: "SIGNATURE",
        formKey,
        formCode: meta.code,
        formTitle: meta.title,
        orgId: org.id,
        orgName: org.name,
        orgAcronym: org.acronym,
        ay: routeAy,
        routeId: route.id,
        version: route.version,
        requiredRole: currentStep.role,
        detail: `${route.title ?? meta.title} is waiting for your signature.`,
        href,
        priority: "high",
      });
    } else if (route.state === "RETURNED_FOR_REVISION") {
      const firstStep = route.steps[0];
      if (!firstStep) continue;
      const eligible = await resolveSigners(firstStep.role, orgCtx);
      if (!eligible.includes(user.id)) continue;
      tasks.push({
        type: "RESUBMIT",
        formKey,
        formCode: meta.code,
        formTitle: meta.title,
        orgId: org.id,
        orgName: org.name,
        orgAcronym: org.acronym,
        ay: routeAy,
        routeId: route.id,
        version: route.version,
        requiredRole: firstStep.role,
        detail: `${route.title ?? meta.title} was returned for revision — review, then resubmit.`,
        href,
        priority: "high",
      });
    }
  }

  // Deadlines that are OPEN for this person's organizations and need the
  // organization to act (recognition/renewal paths lead to actionable pages).
  // Plain members cannot act on an organization's submission, and the
  // accreditation page is office/officer-only — so personal-deadline tasks
  // are skipped for them (their dashboard surfaces activities + attendance instead).
  const deadlines = await listActiveDeadlines();
  const open =
    user.role === "MEMBER"
      ? []
      : deadlines.filter(
          (d) =>
            (d.process === "RECOGNITION" || d.process === "RENEWAL") &&
            deadlineStatus(d) === "OPEN"
        );
  for (const d of open) {
    const applicable = orgs.filter((o) =>
      deadlineAppliesToOrg(d, { type: o.type, collegeId: o.collegeId })
    );
    for (const o of applicable) {
      tasks.push({
        type: "DEADLINE",
        formKey: "",
        formCode: "",
        formTitle: d.name,
        orgId: o.id,
        orgName: o.name,
        orgAcronym: o.acronym,
        ay: d.academicYear,
        detail: `${d.name} closes ${d.dueDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}.`,
        href: `/organizations/${o.id}/accreditation`,
        priority: "low",
        dueAt: d.dueDate,
      });
    }
  }

  return tasks.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    const ad = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bd = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;
    return a.orgName.localeCompare(b.orgName);
  });
}