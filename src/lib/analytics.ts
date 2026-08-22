import "server-only";
import type {
  ActivityScope,
  DeadlineProcess,
  DeadlineScope,
  OrgType,
  RecognitionKind,
  RecognitionStatus,
  ReportStatus,
} from "@/generated/prisma/client";
import {
  ATTACHMENT_KIND_LABELS,
  type AttachmentKind,
} from "@/lib/attachments";

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
  members: { position: string }[];
  recognitions: { kind: RecognitionKind; academicYear: string; status: RecognitionStatus }[];
  activities: { academicYear: string; status: string; scope: ActivityScope }[];
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
  "SUBMITTED", "UNDER_REVIEW", "FOR_APPROVAL", "APPROVED", "RECOGNIZED",
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
      ["APPROVED", "COMPLETED"].includes(a.status)
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
};

/**
 * The seven SF-001 accreditation requirements for one org in one AY.
 * The letter is satisfied by a filed recognition; the other six by tagged
 * attachments (accomplishment reports also count first-class reports).
 */
export function requirementsChecklist(o: OrgSnapshot, ay: string): RequirementItem[] {
  return checklistForYear(o.recognitions, o.requirementFiles, o.reports, ay);
}

/** Narrow-input variant used by the per-org document repository page. */
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
  return REQUIREMENT_ORDER.map((key) => ({
    key,
    label: requirementLabel(key),
    met:
      key === APPLICATION_LETTER_KEY
        ? letterMet
        : tagged.has(key) ||
          (key === "ACCOMPLISHMENT_REPORTS" &&
            reports.some((r) => r.academicYear === ay && FILED_REPORT.includes(r.status as never))),
  }));
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
  if (acts.some((a) => ["APPROVED", "COMPLETED"].includes(a.status))) return "APPROVED";
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
