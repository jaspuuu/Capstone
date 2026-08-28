// Pure display helpers shared by the analytics dashboard and CSV export.

export const FIN_META: Record<string, { tone: "success" | "danger" | "warning"; label: string }> = {
  SUBMITTED: { tone: "success", label: "Submitted" },
  OVERDUE: { tone: "danger", label: "Overdue" },
  PENDING: { tone: "warning", label: "Unsubmitted" },
};

export function deadlineAppliesLite(
  d: { scopeType: string; scopeCollegeId: string | null },
  o: { type: string },
  collegeId: string | null
): boolean {
  if (d.scopeCollegeId && d.scopeCollegeId !== collegeId) return false;
  if (d.scopeType === "MOTHER") return o.type === "MOTHER";
  if (d.scopeType === "CHILD") return o.type === "CHILD";
  if (d.scopeType === "INDEPENDENT") return o.type === "INDEPENDENT";
  return true;
}

export function deltaHint(d: number | null, unit = "pts"): string | undefined {
  if (d == null) return undefined;
  return d > 0 ? `up ${d}${unit} from the previous cycle` : d < 0 ? `down ${Math.abs(d)}${unit} vs the previous cycle` : "flat vs the previous cycle";
}

export function evalHint(avg: number | null): string {
  return avg != null ? `fallback attendance capture averages ${avg}%` : "no attendance data either";
}

type CompletionMon = { completed: number; planned: number };
type SliceMon = CompletionMon & { approved: number; endedWithoutReport: { id: string }[] };
type SummaryMon = { completed: number; endedWithoutReport: unknown[] };

export function overallActivityCompletion(monitored: CompletionMon[]): number {
  const planned = monitored.reduce((s, m) => s + m.planned, 0);
  const completed = monitored.reduce((s, m) => s + m.completed, 0);
  return planned > 0 ? Math.round((completed / planned) * 100) : 0;
}

export function activityPlannedTotal(monitored: { planned: number }[]): number {
  return monitored.reduce((s, m) => s + m.planned, 0);
}

export function activityStatusSlices(monitored: SliceMon[]): { label: string; value: number; tone: "success" | "info" | "warning" | "danger" }[] {
  const completed = monitored.reduce((s, m) => s + m.completed, 0);
  const ongoing = monitored.reduce((s, m) => s + Math.max(0, m.approved - m.completed), 0);
  const pending = monitored.reduce((s, m) => s + Math.max(0, m.planned - m.approved - m.completed), 0);
  const overdue = monitored.reduce((s, m) => s + m.endedWithoutReport.length, 0);
  return [
    { label: "Completed", value: completed, tone: "success" },
    { label: "Ongoing", value: ongoing, tone: "info" },
    { label: "Pending approval", value: pending, tone: "warning" },
    { label: "Overdue", value: overdue, tone: "danger" },
  ];
}

export function evaluationSummary(monitored: SummaryMon[], avg: number | null) {
  const orgs = monitored.length;
  const activities = monitored.reduce((s, m) => s + m.completed + m.endedWithoutReport.length, 0);
  return { loaded: activities > 0, orgs, activities, avg };
}