import type { Deadline } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export type DeadlineStatus = "UPCOMING" | "OPEN" | "CLOSED";

export function deadlineStatus(d: Pick<Deadline, "startDate" | "dueDate">, now = new Date()): DeadlineStatus {
  if (now < new Date(d.startDate)) return "UPCOMING";
  if (now <= new Date(d.dueDate)) return "OPEN";
  return "CLOSED";
}

/** Whether an organization-type/college-scoped deadline applies to the given org. */
export function deadlineAppliesToOrg(
  d: Pick<Deadline, "scopeType" | "scopeCollegeId" | "isActive">,
  org: { type: string; collegeId: string }
): boolean {
  if (!d.isActive) return false;
  if (d.scopeCollegeId && d.scopeCollegeId !== org.collegeId) return false;
  if (d.scopeType === "ALL") return true;
  return d.scopeType === org.type;
}

export function listActiveDeadlines() {
  return db.deadline.findMany({
    where: { isActive: true },
    include: { scopeCollege: { select: { name: true, code: true } } },
    orderBy: { dueDate: "asc" },
  });
}
