import type { NotificationCategory, NotificationPriority } from "@/generated/prisma/client";
import { AlertCircle, CheckCircle2, Info, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared presentation metadata for the notification center. Server-safe (no
 * "use client") so the page, the shell snapshot and the popover all agree.
 */

export function PriorityIcon({
  priority,
  className,
}: {
  priority: NotificationPriority;
  className?: string;
}) {
  const tone = PRIORITY_META[priority].iconTone;
  if (priority === "ACTION_REQUIRED")
    return <AlertCircle className={cn("size-4", tone, className)} aria-hidden />;
  if (priority === "ATTENTION") return <Timer className={cn("size-4", tone, className)} aria-hidden />;
  if (priority === "SUCCESS") return <CheckCircle2 className={cn("size-4", tone, className)} aria-hidden />;
  return <Info className={cn("size-4", tone, className)} aria-hidden />;
}

export const PRIORITY_META: Record<
  NotificationPriority,
  { label: string; short: string; dot: string; iconTone: string; description: string }
> = {
  ACTION_REQUIRED: {
    label: "Action required",
    short: "Action",
    dot: "bg-danger",
    iconTone: "bg-danger-light text-danger",
    description: "Something needs you to act before a workflow can continue.",
  },
  ATTENTION: {
    label: "Attention",
    short: "Attention",
    dot: "bg-warning",
    iconTone: "bg-warning-light text-warning",
    description: "Relevant soon — upcoming deadlines, things you should know.",
  },
  INFO: {
    label: "Information",
    short: "Info",
    dot: "bg-primary",
    iconTone: "bg-primary-light text-primary",
    description: "Something changed; no action expected.",
  },
  SUCCESS: {
    label: "Completed",
    short: "Done",
    dot: "bg-success",
    iconTone: "bg-success-light text-success",
    description: "A step finished — signature chains, approvals, filed submissions.",
  },
};

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  SIGNATURE: "Signature",
  REVIEW: "Review",
  REVISION: "Revision",
  APPROVAL: "Approval",
  DEADLINE: "Deadlines",
  INTERVIEW: "Interview",
  SUBMISSION: "Submission",
  MEMBERSHIP: "Membership",
  ACTIVITY: "Activities",
  REPORT: "Reports",
  FINANCIAL: "Financial",
  FOLLOW_UP: "Follow-up",
  SYSTEM: "System",
};

/** Categories that must always deliver an ACTION_REQUIRED row (cannot be muted). */
export const MANDATORY_CATEGORIES: readonly NotificationCategory[] = ["SIGNATURE", "REVIEW", "REVISION", "DEADLINE"];

export const CATEGORY_ORDER: readonly NotificationCategory[] = [
  "SIGNATURE",
  "REVIEW",
  "REVISION",
  "DEADLINE",
  "APPROVAL",
  "INTERVIEW",
  "SUBMISSION",
  "MEMBERSHIP",
  "ACTIVITY",
  "REPORT",
  "FINANCIAL",
  "FOLLOW_UP",
  "SYSTEM",
];