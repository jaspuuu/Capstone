import "server-only";
import type {
  ActivityScope,
  DeadlineProcess,
  DeadlineScope,
  OrgType,
  RecognitionKind,
  RecognitionStatus,
  ReportStatus,
  SignatoryRole,
} from "@/generated/prisma/client";
import {
  ATTACHMENT_KIND_LABELS,
  type AttachmentKind,
} from "@/lib/attachments";
import { SIGNATORY_LABELS } from "@/lib/form-routes";
import { RECOGNITION_WORKFLOW, transitionFor } from "@/lib/workflow";

/**
 * Five-layer analytics model (capstone proposal, "Data Analytics"):
 * descriptive -> diagnostic -> trend -> rule-based alerting ->
 * rule-based prescriptive recommendations. All computations are frequency
 * counts, percentage distributions, and fixed threshold rules - no ML.
 */

// ---------------------------------------------------------------------------
// Shared shapes (projections of Prisma rows)
// ---------------------------------------------------------------------------

export type OrgSnapshot = {
  id: string;
  name: string;
  acronym: string | null;
  type: OrgType;
  status: string;
  collegeName: string | null;
  members: { position: string; status?: string }[];
  recognitions: { kind: RecognitionKind; academicYear: string; status: RecognitionStatus }[];
  activities: {
    academicYear: string;
    status: string;
    phase: string | null;
    scope: ActivityScope;
    /** Present when the analytics page fetches the monitoring-detail shape. */
    id?: string;
    startAt?: Date;
    endAt?: Date;
    expectedParticipants?: number | null;
    estimatedBudget?: number | null;
    attendanceCount?: number;
    reportStatus?: string | null;
    actualParticipants?: number | null;
    actualBudget?: number | null;
  }[];
  reports: { academicYear: string; status: ReportStatus }[];
  /** Tagged SF-001 checklist files on this org's recognitions, by AY. */
  requirementFiles: { kind: AttachmentKind; academicYear: string; createdAt: Date }[];
};

export type DeadlineLite = {
  id: string;
  name: string;
  process: DeadlineProcess;
  academicYear: string;
  dueDate: Date;
  scopeType: DeadlineScope;
  scopeCollegeId: string | null;
};

const SATISFIED_RECOGNITION: RecognitionStatus[] = ["APPROVED", "RECOGNIZED"];
const FILED_RECOGNITION: RecognitionStatus[] = [
  "SUBMITTED", "UNDER_REVIEW", "FOR_APPROVAL", "FOR_SIGNATURE", "APPROVED", "RECOGNIZED",
];
const FILED_REPORT: ReportStatus[] = ["SUBMITTED", "ACCEPTED"];

export function prevAcademicYear(ay: string): string {
  const [start] = ay.split("-").map(Number);
  return `${start - 1}-${start}`;
}

/** Short label for charts: "2026-2027" -> "26-27". */
export function shortAY(ay: string): string {
  const [a, b] = ay.split("-");
  return `${a.slice(2)}-${b.slice(2)}`;
}

function officerCount(o: OrgSnapshot): number {
  return o.members.filter((m) => m.position === "PRESIDENT" || m.position === "SECRETARY").length;
}

// ---------------------------------------------------------------------------
// Layer 1 - Descriptive: frequency counts and percentage distributions
// ---------------------------------------------------------------------------

export type OrgDescriptive = {
  id: string;
  name: string;
  acronym: string | null;
  collegeName: string | null;
  memberCount: number;
  officerRatio: string;
  recognitionLabel: string;
  recognitionSatisfied: boolean;
  activitiesFiled: number;
  activitiesApprovedUp: number;
  reportsAccepted: number;
  reportsFiled: number;
};

export function describeOrg(o: OrgSnapshot, ay: string): OrgDescriptive {
  const members = o.members.length;
  const officers = officerCount(o);
  const rec = o.recognitions.find((r) => r.academicYear === ay);
  const acts = o.activities.filter((a) => a.academicYear === ay);
  const reps = o.reports.filter((r) => r.academicYear === ay);
  const satisfied =
    rec != null
      ? SATISFIED_RECOGNITION.includes(rec.status) ||
        o.recognitions.some(
          (r) => SATISFIED_RECOGNITION.includes(r.status) && r.academicYear < ay
        )
      : o.recognitions.some(
          (r) => SATISFIED_RECOGNITION.includes(r.status) && r.academicYear < ay
        );
  return {
    id: o.id,
    name: o.name,
    acronym: o.acronym,
    collegeName: o.collegeName,
    memberCount: members,
    officerRatio:
      members > 0 ? `1 : ${Math.round((members / Math.max(officers, 1)) * 10) / 10}` : "—",
    recognitionLabel: rec ? rec.status : satisfied ? "RECOGNIZED (prior)" : "NONE",
    recognitionSatisfied: satisfied,
    activitiesFiled: acts.length,
    activitiesApprovedUp: acts.filter((a) =>
      a.status === "APPROVED" || ["ACCOMPLISHMENT", "ARCHIVE"].includes(a.phase ?? "")
    ).length,
    reportsAccepted: reps.filter((r) => r.status === "ACCEPTED").length,
    reportsFiled: reps.filter((r) => FILED_REPORT.includes(r.status)).length,
  };
}

// ---------------------------------------------------------------------------
// Accreditation requirements checklist (SF-001) - descriptive indicators
// ---------------------------------------------------------------------------

/** The application/renewal letter is the recognition submission itself. */
export const APPLICATION_LETTER_KEY = "APPLICATION_LETTER" as const;
export type RequirementKey = typeof APPLICATION_LETTER_KEY | AttachmentKind;

const REQUIREMENT_ORDER: RequirementKey[] = [
  APPLICATION_LETTER_KEY,
  "CONSTITUTION",
  "PLAN_OF_ACTIVITIES",
  "ACCOMPLISHMENT_REPORTS",
  "ADVISER_COMMITMENT",
  "CERTIFICATION",
  "FINANCIAL_REPORT",
];

export function requirementLabel(key: RequirementKey): string {
  return key === APPLICATION_LETTER_KEY
    ? "Application/Renewal Letter"
    : ATTACHMENT_KIND_LABELS[key];
}

export type RequirementItem = {
  key: RequirementKey;
  label: string;
  met: boolean;
  /** §23 lifecycle of the document itself, derived from the application's stage. */
  status: RequirementStatus;
};

export type RequirementStatus =
  | "REQUIRED"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "RETURNED";

/**
 * The seven SF-001 accreditation requirements for one org in one AY.
 * The letter is satisfied by a filed recognition; the other six by tagged
 * attachments (accomplishment reports also count first-class reports).
 */
export function requirementsChecklist(o: OrgSnapshot, ay: string): RequirementItem[] {
  return checklistForYear(o.recognitions, o.requirementFiles, o.reports, ay);
}

/**
 * Narrow-input variant used by the per-org document repository page and the
 * renewal progress overview. The document's status follows the application
 * it is attached to: submitted docs are Under Review while the application
 * is being processed, Approved once it is recognized, Returned if it bounces.
 */
export function checklistForYear(
  recognitions: { academicYear: string; status: string }[],
  requirementFiles: { academicYear: string; kind: string | null }[],
  reports: { academicYear: string; status: string }[],
  ay: string
): RequirementItem[] {
  const letterMet = recognitions.some(
    (r) => r.academicYear === ay && FILED_RECOGNITION.includes(r.status as never)
  );
  const tagged = new Set(
    requirementFiles.filter((f) => f.academicYear === ay).map((f) => f.kind)
  );

  const yearStatuses = new Set(
    recognitions.filter((r) => r.academicYear === ay).map((r) => r.status)
  );
  const deriveStatus = (met: boolean): RequirementStatus => {
    if (!met) return "REQUIRED";
    if (yearStatuses.has("APPROVED") || yearStatuses.has("RECOGNIZED")) return "APPROVED";
    if (yearStatuses.has("RETURNED")) return "RETURNED";
    if (["SUBMITTED", "UNDER_REVIEW", "FOR_APPROVAL"].some((s) => yearStatuses.has(s))) {
      return "UNDER_REVIEW";
    }
    return "SUBMITTED";
  };

  return REQUIREMENT_ORDER.map((key) => {
    const met =
      key === APPLICATION_LETTER_KEY
        ? letterMet
        : tagged.has(key) ||
          (key === "ACCOMPLISHMENT_REPORTS" &&
            reports.some((r) => r.academicYear === ay && FILED_REPORT.includes(r.status as never)));
    return {
      key,
      label: requirementLabel(key),
      met,
      status: deriveStatus(met),
    };
  });
}

export function compliancePct(items: RequirementItem[]): number {
  return Math.round((items.filter((i) => i.met).length / items.length) * 100);
}

// ---------------------------------------------------------------------------
// Financial compliance + plan of activities status
// ---------------------------------------------------------------------------

export type FinancialStatus = "SUBMITTED" | "OVERDUE" | "PENDING";
export type PlanStatus = "APPROVED" | "FILED" | "DRAFT_ONLY" | "MISSING";

export function financialCompliance(
  o: OrgSnapshot,
  ay: string,
  deadlines: DeadlineLite[],
  collegeId: string | null,
  now: Date = new Date()
): FinancialStatus {
  if (o.requirementFiles.some((f) => f.academicYear === ay && f.kind === "FINANCIAL_REPORT")) {
    return "SUBMITTED";
  }
  // Overdue once any applicable accreditation deadline for the year has passed.
  const accreditation = deadlines.filter(
    (d) =>
      (d.process === "RECOGNITION" || d.process === "RENEWAL") &&
      d.academicYear === ay &&
      deadlineApplies(d, o, collegeId)
  );
  return accreditation.some((d) => d.dueDate.getTime() < now.getTime()) ? "OVERDUE" : "PENDING";
}

export function planOfActivitiesStatus(o: OrgSnapshot, ay: string): PlanStatus {
  const acts = o.activities.filter((a) => a.academicYear === ay);
  if (acts.some((a) => a.status === "APPROVED" || ["ACCOMPLISHMENT", "ARCHIVE"].includes(a.phase ?? ""))) return "APPROVED";
  if (acts.some((a) => ["SUBMITTED", "ENDORSED"].includes(a.status))) return "FILED";
  if (acts.length > 0) return "DRAFT_ONLY";
  if (o.requirementFiles.some((f) => f.academicYear === ay && f.kind === "PLAN_OF_ACTIVITIES")) {
    return "FILED";
  }
  return "MISSING";
}

// ---------------------------------------------------------------------------
// Layer 2 - Diagnostic: what is missed most, where the workflow stalls
// ---------------------------------------------------------------------------

export type Diagnostic = {
  returnedByEntity: { label: string; value: number }[];
  stageDays: { label: string; value: number }[];
};

const ENTITY_LABELS: Record<string, string> = {
  Recognition: "Accreditation applications",
  ActivityProposal: "Activity proposals",
  AccomplishmentReport: "Accomplishment reports",
};

/**
 * Average calendar days spent in each signatory stage, from recorded
 * timestamps on recognition applications (the OrgAcc workflow).
 */
export function diagnose(
  auditRows: { action: string; entityType: string }[],
  recognitions: {
    submittedAt: Date | null;
    reviewedAt: Date | null;
    decidedAt: Date | null;
  }[]
): Diagnostic {
  const counts = new Map<string, number>();
  for (const row of auditRows) {
    if (!row.action.endsWith("_RETURNED") && !row.action.endsWith("_REJECTED")) continue;
    const label = ENTITY_LABELS[row.entityType];
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const days = (a: Date | null, b: Date | null) =>
    a && b ? Math.max(0, (b.getTime() - a.getTime()) / 86_400_000) : null;

  const toReview: number[] = [];
  const toDecision: number[] = [];
  const endToEnd: number[] = [];
  for (const r of recognitions) {
    const d1 = days(r.submittedAt, r.reviewedAt);
    const d2 = days(r.reviewedAt ?? r.submittedAt, r.decidedAt);
    const d3 = days(r.submittedAt, r.decidedAt);
    if (d1 != null) toReview.push(d1);
    if (d2 != null) toDecision.push(d2);
    if (d3 != null) endToEnd.push(d3);
  }
  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : 0;

  return {
    returnedByEntity: [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    stageDays: [
      { label: "Submit → Review", value: avg(toReview) },
      { label: "Review → Decision", value: avg(toDecision) },
      { label: "End-to-end", value: avg(endToEnd) },
    ],
  };
}

export type RequirementDiagnostic = {
  /** How many active orgs are missing each SF-001 checklist item this AY. */
  missed: { label: string; value: number }[];
  /** Checklist files uploaded after their accreditation deadline had passed. */
  late: { label: string; value: number }[];
};

/**
 * Requirement-level breakdown across all organizations: which of the seven
 * accreditation requirements are most frequently unmet, and which are most
 * often submitted late relative to the org's applicable accreditation
 * deadline for the year.
 */
export function diagnoseRequirements(
  orgs: OrgSnapshot[],
  ay: string,
  deadlines: DeadlineLite[],
  collegeIdByOrg: Record<string, string | null>
): RequirementDiagnostic {
  const missed = new Map<RequirementKey, number>();
  const late = new Map<RequirementKey, number>();

  for (const o of orgs) {
    if (o.status !== "ACTIVE") continue;
    for (const item of requirementsChecklist(o, ay)) {
      if (!item.met) missed.set(item.key, (missed.get(item.key) ?? 0) + 1);
    }
    // Latest applicable accreditation due date this org is judged against.
    const dueDates = deadlines
      .filter(
        (d) =>
          (d.process === "RECOGNITION" || d.process === "RENEWAL") &&
          d.academicYear === ay &&
          deadlineApplies(d, o, collegeIdByOrg[o.id])
      )
      .map((d) => d.dueDate.getTime());
    if (dueDates.length === 0) continue;
    const dueAt = Math.max(...dueDates);
    for (const f of o.requirementFiles) {
      if (f.academicYear === ay && f.createdAt.getTime() > dueAt) {
        late.set(f.kind, (late.get(f.kind) ?? 0) + 1);
      }
    }
  }

  const toRows = (m: Map<RequirementKey, number>) =>
    [...m.entries()]
      .map(([key, value]) => ({ label: requirementLabel(key), value }))
      .sort((a, b) => b.value - a.value);

  return { missed: toRows(missed), late: toRows(late) };
}

// ---------------------------------------------------------------------------
// Layer 3 - Trend: historical comparisons across accreditation cycles
// ---------------------------------------------------------------------------

export type Trend = {
  members: { label: string; value: number }[];
  recognitionsApproved: { label: string; value: number }[];
  activitiesFiled: { label: string; value: number }[];
};

export function trend(
  memberRows: { academicYear: string }[],
  orgs: OrgSnapshot[]
): Trend {
  const byAY = new Map<string, number>();
  for (const m of memberRows) byAY.set(m.academicYear, (byAY.get(m.academicYear) ?? 0) + 1);

  const recByAY = new Map<string, number>();
  const actByAY = new Map<string, number>();
  for (const o of orgs) {
    for (const r of o.recognitions) {
      if (SATISFIED_RECOGNITION.includes(r.status)) {
        recByAY.set(r.academicYear, (recByAY.get(r.academicYear) ?? 0) + 1);
      }
    }
    for (const a of o.activities) {
      actByAY.set(a.academicYear, (actByAY.get(a.academicYear) ?? 0) + 1);
    }
  }
  const sortAY = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ay, v]) => ({ label: shortAY(ay), value: v }));

  return {
    members: sortAY(byAY),
    recognitionsApproved: sortAY(recByAY),
    activitiesFiled: sortAY(actByAY),
  };
}

/** Year-over-year percentage change; null when no prior figure exists. */
export function pctChange(data: { label: string; value: number }[]): number | null {
  if (data.length < 2) return null;
  const last = data[data.length - 1].value;
  const prev = data[data.length - 2].value;
  if (prev === 0) return null;
  return Math.round(((last - prev) / prev) * 100);
}

// ---------------------------------------------------------------------------
// Layers 4 & 5 - Rule-based alerting + prescriptive recommendations
// Fixed thresholds configured here; recommendations come only from this map.
// ---------------------------------------------------------------------------

export const RISK_WINDOW_DAYS = 7;
export const RISK_MIN_UNMET = 2;

export type UnmetRequirement = {
  deadlineId: string;
  deadlineName: string;
  process: DeadlineProcess;
  dueDate: Date;
  daysLeft: number;
  overdue: boolean;
  repeatedFromPrevAY: boolean;
  /** Set when the unmet item is one SF-001 checklist document. */
  requirementKey?: RequirementKey;
};

export type OrgRisk = {
  orgId: string;
  orgName: string;
  level: "AT_RISK" | "DUE_SOON";
  unmet: UnmetRequirement[];
  recommendation: string;
};

function deadlineApplies(d: DeadlineLite, o: OrgSnapshot, collegeId: string | null): boolean {
  if (d.scopeCollegeId && d.scopeCollegeId !== collegeId) return false;
  if (d.scopeType === "ALL") return true;
  if (d.scopeType === "MOTHER") return o.type === "MOTHER";
  if (d.scopeType === "CHILD") return o.type === "CHILD";
  if (d.scopeType === "INDEPENDENT") return o.type === "INDEPENDENT";
  return true;
}

/** Has this org filed (non-draft) the requirement tied to this deadline? */
function hasFiled(
  o: OrgSnapshot,
  process: DeadlineProcess,
  ay: string
): boolean {
  switch (process) {
    case "RECOGNITION":
      return o.recognitions.some(
        (r) => r.kind === ("INITIAL" satisfies RecognitionKind) &&
          r.academicYear === ay && FILED_RECOGNITION.includes(r.status)
      );
    case "RENEWAL":
      return o.recognitions.some(
        (r) => r.kind === ("RENEWAL" satisfies RecognitionKind) &&
          r.academicYear === ay && FILED_RECOGNITION.includes(r.status)
      );
    case "ACCOMPLISHMENT":
      return o.reports.some((r) => r.academicYear === ay && FILED_REPORT.includes(r.status));
    case "ACTIVITY":
      return planOfActivitiesStatus(o, ay) !== "MISSING";
    default:
      // OTHER deadlines carry no system-checkable filing.
      return true;
  }
}

const PROCESS_LABELS: Record<string, string> = {
  RECOGNITION: "accreditation application",
  RENEWAL: "renewal application",
  ACCOMPLISHMENT: "accomplishment report",
  ACTIVITY: "plan of activities",
  OTHER: "requirement",
};

/** Fixed prescriptive mapping: flagged condition -> predefined action. */
function prescribe(unmet: UnmetRequirement[], orgName: string): string {
  const nameOf = (u: UnmetRequirement) =>
    u.requirementKey ? requirementLabel(u.requirementKey) : PROCESS_LABELS[u.process];

  const repeated = unmet.find((u) => u.repeatedFromPrevAY);
  if (repeated) {
    return `Recommend an adviser consultation — ${orgName} also missed the ${nameOf(repeated)} in the previous academic year.`;
  }
  const urgent = [...unmet].filter((u) => !u.overdue).sort((a, b) => a.daysLeft - b.daysLeft)[0] ?? unmet[0];
  if (urgent.overdue) {
    return `Follow up on the overdue ${nameOf(urgent)} (“${urgent.deadlineName}”) and record the reason for non-submission.`;
  }
  return `Send an urgent reminder to submit the ${nameOf(urgent)} before ${urgent.dueDate.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}.`;
}

/** Is the same checklist item also missing from the previous year's files? */
function itemRepeated(
  o: OrgSnapshot,
  requirementKey: RequirementKey,
  ay: string
): boolean {
  const item = requirementsChecklist(o, ay).find((i) => i.key === requirementKey);
  return item != null && !item.met;
}

export function assessRisk(
  orgs: OrgSnapshot[],
  deadlines: DeadlineLite[],
  collegeIdByOrg: Record<string, string | null>,
  now: Date = new Date()
): OrgRisk[] {
  const risks: OrgRisk[] = [];
  for (const o of orgs) {
    if (o.status !== "ACTIVE") continue;
    const unmet: UnmetRequirement[] = [];
    for (const d of deadlines) {
      if (!deadlineApplies(d, o, collegeIdByOrg[o.id])) continue;
      if (hasFiled(o, d.process, d.academicYear)) {
        // Application is in but individual checklist documents may be missing.
        if (d.process === "RECOGNITION" || d.process === "RENEWAL") {
          for (const item of requirementsChecklist(o, d.academicYear)) {
            if (item.met || item.key === APPLICATION_LETTER_KEY) continue;
            const msLeft = d.dueDate.getTime() - now.getTime();
            const daysLeft = Math.ceil(msLeft / 86_400_000);
            if (daysLeft > RISK_WINDOW_DAYS) continue;
            unmet.push({
              deadlineId: d.id,
              deadlineName: d.name,
              process: d.process,
              dueDate: d.dueDate,
              daysLeft,
              overdue: daysLeft < 0,
              repeatedFromPrevAY: itemRepeated(o, item.key, prevAcademicYear(d.academicYear)),
              requirementKey: item.key,
            });
          }
        }
        continue;
      }
      const msLeft = d.dueDate.getTime() - now.getTime();
      const daysLeft = Math.ceil(msLeft / 86_400_000);
      if (daysLeft > RISK_WINDOW_DAYS) continue; // outside the risk window
      unmet.push({
        deadlineId: d.id,
        deadlineName: d.name,
        process: d.process,
        dueDate: d.dueDate,
        daysLeft,
        overdue: daysLeft < 0,
        repeatedFromPrevAY: !hasFiled(o, d.process, prevAcademicYear(d.academicYear)),
      });
    }
    if (unmet.length === 0) continue;
    unmet.sort((a, b) => a.daysLeft - b.daysLeft);
    risks.push({
      orgId: o.id,
      orgName: o.acronym ?? o.name,
      level: unmet.length >= RISK_MIN_UNMET ? "AT_RISK" : "DUE_SOON",
      unmet,
      recommendation: prescribe(unmet, o.acronym ?? o.name),
    });
  }
  return risks.sort((a, b) => {
    if (a.level !== b.level) return a.level === "AT_RISK" ? -1 : 1;
    return a.unmet[0].daysLeft - b.unmet[0].daysLeft;
  });
}

// ---------------------------------------------------------------------------
// Analytics module (PA 5 / analytics prompt) — the same five layers, computed
// over the richer monitoring shape. All inputs are projections of real rows;
// nothing is invented, forecast, or scored outside an explicit rule.
// ---------------------------------------------------------------------------

// --- Descriptive: cycle-level compliance trend ---------------------------------

/** How many of the seven checklist items an org has met in a given AY. */
export function compliancePctYear(o: OrgSnapshot, ay: string): number | null {
  const represented =
    o.recognitions.some((r) => r.academicYear === ay) ||
    o.reports.some((r) => r.academicYear === ay) ||
    o.requirementFiles.some((f) => f.academicYear === ay) ||
    o.activities.some((a) => a.academicYear === ay);
  if (!represented) return null;
  return compliancePct(checklistForYear(o.recognitions, o.requirementFiles, o.reports, ay));
}

/** Average compliance % per cycle (null when no org is represented that year). */
export function complianceByYear(orgs: OrgSnapshot[]): CyclePoint[] {
  return cycleYears(orgs)
    .map((ay) => {
      const scores = orgs
        .map((o) => compliancePctYear(o, ay))
        .filter((p): p is number => p != null);
      if (scores.length === 0) return null;
      return { label: shortAY(ay), value: Math.round(scores.reduce((s, p) => s + p, 0) / scores.length) };
    })
    .filter((p): p is CyclePoint => p != null);
}

/** Percentage-point change between the two most recent cycles, else null. */
export function complianceDelta(points: CyclePoint[]): number | null {
  if (points.length < 2) return null;
  return points[points.length - 1].value - points[points.length - 2].value;
}

export type CyclePoint = { label: string; value: number };

function cycleYears(orgs: OrgSnapshot[]): string[] {
  const years = new Set<string>();
  for (const o of orgs) {
    for (const r of o.recognitions) years.add(r.academicYear);
    for (const f of o.requirementFiles) years.add(f.academicYear);
    for (const r of o.reports) years.add(r.academicYear);
    for (const a of o.activities) years.add(a.academicYear);
  }
  return [...years].sort();
}

// --- Descriptive: activity pipeline per cycle ----------------------------------

export type ActivityTrendRow = { label: string; planned: number; approved: number; completed: number };

export function activityTrend(orgs: OrgSnapshot[]): ActivityTrendRow[] {
  const byAY = new Map<string, ActivityTrendRow>();
  for (const o of orgs) {
    for (const a of o.activities) {
      const row = byAY.get(a.academicYear) ?? { label: shortAY(a.academicYear), planned: 0, approved: 0, completed: 0 };
      row.planned += 1;
      if (a.status === "APPROVED") row.approved += 1;
      if (["ACCOMPLISHMENT", "ARCHIVE"].includes(a.phase ?? "")) row.completed += 1;
      byAY.set(a.academicYear, row);
    }
  }
  return [...byAY.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, row]) => row);
}

/** Implementation rate: completed / approved-and-planned activities, or null. */
export function activityCompletionPct(planned: number, completed: number): number | null {
  if (planned <= 0) return null;
  return Math.round((completed / planned) * 100);
}

/** Activity implementation rate (%) per cycle line. */
export function activityCompleteTrend(orgs: OrgSnapshot[]): CyclePoint[] {
  return activityTrend(orgs)
    .map((row) => {
      const pct = activityCompletionPct(row.planned, row.completed);
      return pct == null ? null : { label: row.label, value: pct };
    })
    .filter((p): p is CyclePoint => p != null);
}

// --- Diagnostic: workflow stage delays from RecognitionEvent timestamps ---------

export type WorkflowStageDelay = { stage: string; days: number };

const WORKFLOW_MILESTONE_ACTIONS = new Set([
  "SUBMIT",
  "START_REVIEW",
  "ENDORSE",
  "ADVANCE_TO_SIGNATURE",
  "APPROVE",
  "CONFER",
  "RETURN",
]);

function milestoneLabel(action: string): string {
  const t = transitionFor(RECOGNITION_WORKFLOW, action);
  if (t) return t.label;
  return action;
}

/**
 * Average calendar days between consecutive recorded recognition actions at
 * each configured workflow milestone ("Submit application", "Start review",
 * "Endorse for approval", "Forward for signature", "Approve application",
 * "Confer recognition"). Only stages present in the configured workflow and
 * with recorded timestamps are emitted.
 */
export function diagnoseWorkflow(
  events: { recognitionId: string; action: string; createdAt: Date }[]
): WorkflowStageDelay[] {
  const byRec = new Map<string, { action: string; createdAt: Date }[]>();
  for (const e of events) {
    const list = byRec.get(e.recognitionId) ?? [];
    list.push({ action: e.action, createdAt: e.createdAt });
    byRec.set(e.recognitionId, list);
  }
  const acc = new Map<string, number[]>();
  for (const rows of byRec.values()) {
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (let i = 1; i < rows.length; i++) {
      if (!WORKFLOW_MILESTONE_ACTIONS.has(rows[i].action)) continue;
      const prev = rows[i - 1];
      if (prev.createdAt.getTime() >= rows[i].createdAt.getTime()) continue;
      const days = (rows[i].createdAt.getTime() - prev.createdAt.getTime()) / 86_400_000;
      const stage = milestoneLabel(rows[i].action);
      const list = acc.get(stage) ?? [];
      list.push(days);
      acc.set(stage, list);
    }
  }
  return [...acc.entries()]
    .map(([stage, xs]) => ({
      stage,
      days: Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10,
    }))
    .sort((a, b) => b.days - a.days);
}

// --- Diagnostic: signature-route bottlenecks -------------------------------------

export type SignatureBottleneck = { role: SignatoryRole; label: string; count: number };

/** Documents currently awaiting action, grouped by signatory role. */
export function signatureBottlenecks(steps: { role: SignatoryRole }[]): SignatureBottleneck[] {
  const counts = new Map<SignatoryRole, number>();
  for (const s of steps) counts.set(s.role, (counts.get(s.role) ?? 0) + 1);
  return [...counts.entries()]
    .map(([role, count]) => ({ role, label: SIGNATORY_LABELS[role] ?? role, count }))
    .sort((a, b) => b.count - a.count);
}

// --- Layers 4 & 5: explicit alert rules + rule-based recommendations --------------

export type AlertPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";

export type AnalyticsAlert = {
  id: string;
  priority: AlertPriority;
  kind: string;
  title: string;
  detail: string;
  why: string;
  orgId: string | null;
  href: string;
};

export const PRIORITY_META: Record<AlertPriority, { tone: "danger" | "warning" | "info" | "neutral"; label: string }> = {
  CRITICAL: { tone: "danger", label: "Critical" },
  HIGH: { tone: "warning", label: "High" },
  MEDIUM: { tone: "info", label: "Medium" },
  INFO: { tone: "neutral", label: "Informational" },
};

/** CAPS rule (alerting) + predefined action map (prescriptive). */
export function riskAlerts(risks: OrgRisk[]): AnalyticsAlert[] {
  return risks.map((r, i) => {
    const critical = r.level === "AT_RISK";
    return {
      id: `risk-${i}`,
      priority: critical ? "CRITICAL" : "HIGH",
      kind: critical ? "AT_RISK" : "DUE_SOON",
      title: `${r.orgName} — ${critical ? "At Risk" : "Due Soon"}`,
      detail: `${r.unmet.length} unmet requirement${r.unmet.length === 1 ? "" : "s"} · ${r.unmet[0].overdue ? Math.abs(r.unmet[0].daysLeft) + " day(s) overdue" : r.unmet[0].daysLeft + " day(s) to deadline"}`,
      why: critical
        ? `Rule: an organization is At Risk when it has ${RISK_MIN_UNMET} or more unmet requirements within ${RISK_WINDOW_DAYS} days of the submission deadline.`
        : `Rule: one unmet requirement is due within ${RISK_WINDOW_DAYS} days of the submission deadline.`,
      orgId: r.orgId,
      href: `/analytics/org/${r.orgId}`,
    };
  });
}

/** Financial report overdue → Critical; flagged the day the deadline passes. */
export function financialAlerts(
  orgs: OrgSnapshot[],
  ay: string,
  deadlines: DeadlineLite[],
  collegeIdByOrg: Record<string, string | null>
): AnalyticsAlert[] {
  return orgs
    .filter((o) => o.status === "ACTIVE" && financialCompliance(o, ay, deadlines, collegeIdByOrg[o.id]) === "OVERDUE")
    .map((o): AnalyticsAlert => ({
      id: `fin-${o.id}`,
      priority: "CRITICAL",
      kind: "FINANCIAL_OVERDUE",
      title: `${o.acronym ?? o.name} — financial report overdue`,
      detail: "The accreditation Financial Report has not been submitted after the deadline.",
      why: "Rule: financial compliance is flagged Overdue once any applicable accreditation deadline for the year has passed without the report.",
      orgId: o.id,
      href: `/analytics/org/${o.id}`,
    }))
    .filter((a, i, all) => all.findIndex((x) => x.orgId === a.orgId) === i);
}

/** Ended-but-unreported activities → High. */
export function reportAlerts(endedWithoutReport: { orgId: string; orgName: string; count: number }[]): AnalyticsAlert[] {
  return endedWithoutReport
    .filter((e) => e.count > 0)
    .map((e): AnalyticsAlert => ({
      id: `rep-${e.orgId}`,
      priority: "HIGH",
      kind: "REPORT_MISSING",
      title: `${e.orgName} — ${e.count} ended activity${e.count === 1 ? "" : "ies"} without an accomplishment report`,
      detail: "Monitoring flags these activities for evaluation follow-up.",
      why: "Rule: an activity whose end date has passed without a linked accomplishment report is marked as needing evaluation.",
      orgId: e.orgId,
      href: `/monitoring`,
    }))
    .filter((a, i, all) => all.findIndex((x) => x.orgId === a.orgId) === i);
}

export const STALL_WORKFLOW_DAYS = 14;

/** Documents stalled in a workflow status past the configured threshold. */
export function stalledAlerts(
  stalled: { entityId: string; orgId: string; orgName: string; kind: string; status: string; updatedAt: Date }[]
): AnalyticsAlert[] {
  return stalled.map((s, i) => ({
    id: `stall-${i}`,
    priority: "MEDIUM",
    kind: "STALLED_WORKFLOW",
    title: `${s.orgName} — ${s.kind} stalled at “${s.status}”`,
    detail: `No movement for ${Math.round((Date.now() - s.updatedAt.getTime()) / 86_400_000)} days.`,
    why: `Rule: a workflow document is flagged when it has not moved for ${STALL_WORKFLOW_DAYS}+ days.`,
    orgId: s.orgId,
    href: s.entityId,
  }));
}

/** Awaiting-action document counts per signatory (from CURRENT signature steps). */
export function bottleneckAlerts(bottlenecks: SignatureBottleneck[]): AnalyticsAlert[] {
  return bottlenecks.map((b): AnalyticsAlert => ({
    id: `bn-${b.role}`,
    priority: b.count >= 5 ? "MEDIUM" : "INFO",
    kind: "SIGNATURE_BOTTLENECK",
    title: `${b.count} document${b.count === 1 ? "" : "s"} awaiting action at ${b.label}`,
    detail: "Signature-routed forms currently parked at this role.",
    why: "Rule: every routed document has exactly one CURRENT signatory; a large awaiting queue is surfaced for administrative follow-up.",
    orgId: null,
    href: "/forms",
  }));
}

export function prioritySummary(alerts: AnalyticsAlert[]): Record<AlertPriority, number> {
  return {
    CRITICAL: alerts.filter((a) => a.priority === "CRITICAL").length,
    HIGH: alerts.filter((a) => a.priority === "HIGH").length,
    MEDIUM: alerts.filter((a) => a.priority === "MEDIUM").length,
    INFO: alerts.filter((a) => a.priority === "INFO").length,
  };
}
