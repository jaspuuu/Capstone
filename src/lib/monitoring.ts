import "server-only";
import { ACTIVITY_PHASES, ACTIVITY_WORKFLOW } from "@/lib/workflow";

/**
 * Part 8 - Plan of activities monitoring & evaluation (proposal objective
 * 1.1 and the "plan of activities monitoring reports" output).
 *
 * Pure computation over existing activity-proposal data: pipeline counts,
 * evaluation flags (ended-but-unreported, budget variance, attendance
 * capture), and upcoming schedule. Buckets are derived from the shared
 * workflow defs so they can never drift from enforcement.
 */

/** Anything past the draft stage (SUBMITTED / ENDORSED / APPROVED). */
const ACTIVE_STATUSES: string[] = ACTIVITY_WORKFLOW.steps.slice(1).map((s) => s.status);
const REJECTED = ACTIVITY_WORKFLOW.rejectTo;
/** Completion phases: the final two activity phases (ACCOMPLISHMENT/ARCHIVE). */
const COMPLETE_PHASES: string[] = ACTIVITY_PHASES.slice(-2).map((s) => s.status);

export type MonitoredActivity = {
  id: string;
  title: string;
  status: string;
  phase: string | null;
  scope: string;
  venue: string | null;
  startAt: Date;
  endAt: Date;
  estimatedBudget: number | null;
  actualBudget: number | null;
  expectedParticipants: number | null;
  actualParticipants: number | null;
  attendanceCount: number;
  reportStatus: string | null;
  monitoringStatus?: string | null;
  monitoringReason?: string | null;
};

export type OrgMonitoring = {
  id: string;
  name: string;
  acronym: string | null;
  collegeName: string | null;
  activities: MonitoredActivity[];
  planned: number;
  approved: number;
  completed: number;
  returned: number;
  /** Activities whose end date passed with no linked accomplishment report. */
  endedWithoutReport: MonitoredActivity[];
  /** Approved/endorsed activities that have not started yet. */
  upcoming: MonitoredActivity[];
  budgetPlanned: number;
  budgetActual: number;
};

export function monitorOrg(
  o: {
    id: string;
    name: string;
    acronym: string | null;
    collegeName: string | null;
  },
  rows: MonitoredActivity[],
  now: Date = new Date()
): OrgMonitoring {
  const ended = (a: MonitoredActivity) => a.endAt.getTime() < now.getTime();
  const hasReport = (a: MonitoredActivity) => a.reportStatus != null;

  return {
    ...o,
    activities: [...rows].sort((a, b) => a.startAt.getTime() - b.startAt.getTime()),
    planned: rows.filter((a) => a.status !== REJECTED).length,
    approved: rows.filter((a) => a.status === "APPROVED").length,
    completed: rows.filter((a) => COMPLETE_PHASES.includes(a.phase ?? "")).length,
    returned: rows.filter((a) => a.status === "RETURNED").length,
    endedWithoutReport: rows.filter((a) => ended(a) && !hasReport(a)),
    upcoming: rows.filter(
      (a) =>
        a.startAt.getTime() >= now.getTime() &&
        ACTIVE_STATUSES.includes(a.status)
    ),
    budgetPlanned:
      Math.round(
        rows.reduce((s, a) => s + (a.estimatedBudget ?? 0), 0) * 100
      ) / 100,
    budgetActual:
      Math.round(
        rows.reduce((s, a) => s + (a.actualBudget ?? 0), 0) * 100
      ) / 100,
  };
}

/** Attendance capture rate as a whole-number percentage, or null if unknown. */
export function attendanceRate(a: MonitoredActivity): number | null {
  const base =
    a.actualParticipants ?? (a.expectedParticipants != null && a.expectedParticipants > 0 ? a.expectedParticipants : null);
  if (!base || base <= 0 || a.attendanceCount === 0) return null;
  return Math.min(100, Math.round((a.attendanceCount / base) * 100));
}

export type MonitoringSummary = {
  orgCount: number;
  planned: number;
  approved: number;
  completed: number;
  unreportedTotal: number;
  budgetPlanned: number;
  budgetActual: number;
};

export function summarizeMonitoring(orgs: OrgMonitoring[]): MonitoringSummary {
  return {
    orgCount: orgs.length,
    planned: orgs.reduce((s, o) => s + o.planned, 0),
    approved: orgs.reduce((s, o) => s + o.approved, 0),
    completed: orgs.reduce((s, o) => s + o.completed, 0),
    unreportedTotal: orgs.reduce((s, o) => s + o.endedWithoutReport.length, 0),
    budgetPlanned:
      Math.round(orgs.reduce((s, o) => s + o.budgetPlanned, 0) * 100) / 100,
    budgetActual:
      Math.round(orgs.reduce((s, o) => s + o.budgetActual, 0) * 100) / 100,
  };
}
