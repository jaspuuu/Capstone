import type { Role } from "@/generated/prisma/client";
import { ROLE_PERMISSIONS, type Permission } from "@/lib/auth/rbac";
import {
  ACTIVITY_WORKFLOW,
  ORG_APPLICATION_WORKFLOW,
  RECOGNITION_WORKFLOW,
  RENEWAL_WORKFLOW,
  REPORT_WORKFLOW,
  type ProcessKey,
  type WorkflowDef,
} from "@/lib/workflow";

// ---------------------------------------------------------------------------
// Authority matrix — master-prompt §2/§28. The account set is fixed to the
// eight confirmed roles; everything downstream is derived from ROLE_PERMISSIONS
// (rbac) and the workflow defs (workflow) so UI and backend can never drift.
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<Role, string> = {
  OSAS: "OSAS",
  SOA: "SOA",
  DEAN: "College Dean",
  ADVISER_REGULAR: "Senior Adviser",
  ADVISER_PARTTIME: "Junior Adviser",
  PRESIDENT: "Organization President",
  SECRETARY: "Organization Secretary",
  MEMBER: "Student Member",
};

/** "Senior Adviser" (REGULAR) vs "Junior Adviser" (PART_TIME), §14. */
export const ROLE_ADVISER_TYPE: Partial<Record<Role, "REGULAR" | "PART_TIME">> = {
  ADVISER_REGULAR: "REGULAR",
  ADVISER_PARTTIME: "PART_TIME",
};

/**
 * §2 authority order. This expresses authority/scope — NOT a universal
 * signature sequence. Each document still defines its own route (§6).
 */
export const AUTHORITY_CHAIN: readonly Role[] = [
  "OSAS",
  "SOA",
  "DEAN",
  "ADVISER_REGULAR",
  "ADVISER_PARTTIME",
  "PRESIDENT",
  "SECRETARY",
  "MEMBER",
];

export function authorityRank(role: Role): number {
  return AUTHORITY_CHAIN.indexOf(role);
}

/** True when `role` has at least as much authority as `other`. */
export function outranks(role: Role, other: Role): boolean {
  return authorityRank(role) <= authorityRank(other);
}

/** All permissions granted to a role — the enforced matrix (rbac). */
export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** Which roles hold at least one of the given permissions. */
export function rolesFor(permissions: readonly Permission[]): Role[] {
  return (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((role) =>
    permissions.some((p) => ROLE_PERMISSIONS[role].includes(p))
  );
}

/**
 * §32 PROCESS × STATUS → expected actor, derived straight from the workflow
 * defs so the "current location" shown to users matches the enforced rules.
 */
export function processActors(
  def: WorkflowDef<string>
): { status: string; role: Role | null; label: string; action: string; next: string }[] {
  return Object.entries(def.gates).map(([status, gate]) => ({
    status,
    role: gate?.role ?? null,
    label: gate?.label ?? status,
    action: gate?.action ?? "",
    next: gate?.next ?? "",
  }));
}

export const PROCESS_DEFS: Record<Exclude<ProcessKey, "SF_FORM">, WorkflowDef<string>> = {
  ORG_APPLICATION: ORG_APPLICATION_WORKFLOW as WorkflowDef<string>,
  RECOGNITION: RECOGNITION_WORKFLOW as WorkflowDef<string>,
  RENEWAL: RENEWAL_WORKFLOW as WorkflowDef<string>,
  ACTIVITY_PROPOSAL: ACTIVITY_WORKFLOW as WorkflowDef<string>,
  ACCOMPLISHMENT_REPORT: REPORT_WORKFLOW as WorkflowDef<string>,
};

export const PROCESS_ORDER = [
  "ORG_APPLICATION",
  "RECOGNITION",
  "RENEWAL",
  "ACTIVITY_PROPOSAL",
  "ACCOMPLISHMENT_REPORT",
] as const satisfies Exclude<ProcessKey, "SF_FORM">[];