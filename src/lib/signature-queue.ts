import { db } from "@/lib/db";
import { currentAcademicYear } from "@/lib/utils";
import { FORM_META } from "@/lib/form-routes";
import type { Role, SignatoryRole } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Office signature queue — a live list of every document currently waiting on
// an OSAS/SOA signatory step, across all organizations and forms. Read-only:
// the actual sign action always runs the central policy (signature-policy.ts).
// ---------------------------------------------------------------------------

export type SignatureQueueItem = {
  routeId: string;
  formKey: string;
  formCode: string; // "SF-004"
  formTitle: string; // "Plan of Activities"
  documentTitle: string; // route.title ?? formTitle
  orgId: string;
  orgName: string;
  orgAcronym: string | null;
  ay: string;
  version: number;
  requiredRole: SignatoryRole;
  stepNumber: number;
  stepCount: number;
  awaitedSince: Date;
  href: string;
};

export async function getSignatureQueue(
  user: { role: Role; id: string },
  opts: { ay?: string } = {}
): Promise<SignatureQueueItem[]> {
  // The queue is a work list for the offices that hold institution-wide
  // signatory slots (SOA/OSAS). Everyone else has org-scoped work instead.
  if (user.role !== "OSAS" && user.role !== "SOA") return [];

  const ay = opts.ay ?? currentAcademicYear();
  const [routes, orgs] = await Promise.all([
    db.signatureRoute.findMany({
      where: {
        entityType: "SF",
        state: "IN_PROGRESS",
        entityId: { endsWith: `:${ay}` },
      },
      include: { steps: { orderBy: { order: "asc" as const } } },
    }),
    db.organization.findMany({
      select: { id: true, name: true, acronym: true },
    }),
  ]);
  const orgById = new Map(orgs.map((o) => [o.id, o]));

  const items: SignatureQueueItem[] = [];
  for (const route of routes) {
    const [formKey, orgId, routeAy] = route.entityId.split(":");
    if (routeAy !== ay) continue;
    const org = orgById.get(orgId);
    if (!org) continue;
    const meta = FORM_META[formKey as keyof typeof FORM_META];
    if (!meta) continue;

    const currentStep = route.steps.find((s) => s.status === "CURRENT");
    if (!currentStep || (currentStep.role !== "SOA" && currentStep.role !== "OSAS")) continue;

    // "Awaited since" the previous signature in the chain reached this step.
    const lastSigned = route.steps
      .filter((s) => s.signedAt)
      .sort((a, b) => b.signedAt!.getTime() - a.signedAt!.getTime())[0];
    const awaitedSince = lastSigned?.signedAt ?? route.createdAt;

    items.push({
      routeId: route.id,
      formKey,
      formCode: meta.code,
      formTitle: meta.title,
      documentTitle: route.title ?? meta.title,
      orgId: org.id,
      orgName: org.name,
      orgAcronym: org.acronym,
      ay: routeAy,
      version: route.version,
      requiredRole: currentStep.role,
      stepNumber: currentStep.order,
      stepCount: route.steps.length,
      awaitedSince,
      href: `${meta.href}?org=${org.id}&ay=${routeAy}`,
    });
  }

  return items.sort((a, b) => a.awaitedSince.getTime() - b.awaitedSince.getTime());
}