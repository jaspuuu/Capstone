import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ListChecks,
  PenLine,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getMyTasks, type MyTask, type TaskType } from "@/lib/tasks";
import { SIGNATORY_LABELS } from "@/lib/form-routes";
import type { Role } from "@/generated/prisma/client";

const DAY = 86_400_000;

function groupTasks(tasks: MyTask[]) {
  const soon = new Date(Date.now() + 14 * DAY);
  return {
    action: tasks.filter((t) => t.type === "SIGNATURE" || t.type === "RESUBMIT"),
    comingUp: tasks.filter(
      (t) => t.type === "DEADLINE" && t.dueAt && t.dueAt <= soon
    ),
    upcoming: tasks.filter(
      (t) => t.type === "DEADLINE" && t.dueAt && t.dueAt > soon
    ),
  };
}

const CTA: Record<TaskType, { label: string; className: string }> = {
  SIGNATURE: {
    label: "Review & sign",
    className:
      "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover",
  },
  RESUBMIT: {
    label: "Fix submission",
    className:
      "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-gold px-3 text-xs font-semibold text-primary-dark hover:bg-gold-dark hover:text-white",
  },
  DEADLINE: {
    label: "View requirements",
    className:
      "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line-strong px-3 text-xs font-semibold text-content hover:border-primary hover:text-primary",
  },
};

const SUBTITLE: Record<TaskType, string> = {
  SIGNATURE: "Your signature is next in this chain",
  RESUBMIT: "Returned for revision — fix and resubmit",
  DEADLINE: "Closes soon — prepare before the date",
};

function TaskRow({ t, index }: { t: MyTask; index: number }) {
  return (
    <div
      key={`${t.type}-${t.routeId ?? t.formKey}-${t.orgId}-${index}`}
      className="flex items-start gap-3 rounded-lg border border-line bg-surface-secondary/50 p-3"
    >
      <span
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
          t.type === "DEADLINE"
            ? "bg-info/10 text-info"
            : t.type === "RESUBMIT"
              ? "bg-gold/10 text-gold-dark"
              : "bg-primary/10 text-primary"
        }`}
        aria-hidden
      >
        {t.type === "DEADLINE" ? (
          <CalendarClock className="size-4" />
        ) : t.type === "RESUBMIT" ? (
          <RotateCcw className="size-4" />
        ) : (
          <PenLine className="size-4" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-content">
          {t.type === "DEADLINE" ? t.formTitle : `${t.formCode} — ${t.formTitle}`}
        </p>
        <p className="mt-0.5 text-xs text-content-secondary">
          {t.orgAcronym ? `${t.orgName} (${t.orgAcronym})` : t.orgName}
          {t.requiredRole && t.type !== "DEADLINE"
            ? ` · ${SIGNATORY_LABELS[t.requiredRole] ?? t.requiredRole} step`
            : ""}
        </p>
        <p className="mt-0.5 text-xs text-content-muted">
          {t.type === "DEADLINE"
            ? `Due ${t.dueAt?.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`
            : SUBTITLE[t.type]}
        </p>
      </div>

      <Link href={t.href} className={CTA[t.type].className}>
        {CTA[t.type].label} <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

/**
 * "My Tasks" — everything actually waiting on the signed-in person, grouped by
 * urgency. Scoped to one organization (org home) or all their organizations
 * (dashboard). Buttons are contextual: they say what the action will do.
 */
export async function MyTasksCard({
  userId,
  role,
  collegeId,
  orgId,
}: {
  userId: string;
  role: Role;
  collegeId: string | null;
  orgId?: string;
}) {
  const tasks = await getMyTasks({ id: userId, role, collegeId }, { orgId });
  const { action, comingUp, upcoming } = groupTasks(tasks);

  const sections: { key: string; title: string; icon: typeof ListChecks; items: MyTask[]; accent: string }[] = [
    { key: "action", title: `Action required`, icon: PenLine, items: action, accent: "bg-primary/10 text-primary" },
    { key: "coming", title: "Coming up", icon: CalendarClock, items: comingUp, accent: "bg-warning/10 text-warning" },
    { key: "upcoming", title: "Upcoming", icon: ListChecks, items: upcoming, accent: "bg-info/10 text-info" },
  ].filter((s) => s.items.length > 0);

  return (
    <Card>
      <CardHeader
        icon={PenLine}
        title="My tasks"
        description={
          orgId
            ? "What is waiting on you for this organization."
            : action.length > 0
              ? `${action.length} action${action.length === 1 ? "" : "s"} needed right now.`
              : "Documents and deadlines that are waiting on you."
        }
      />
      <CardContent className="space-y-5">
        {sections.length === 0 ? (
          <EmptyState
            className="border-0"
            icon={CheckCircle2}
            title="You’re all caught up here"
            description={
              orgId
                ? "No document or deadline needs your action for this organization."
                : "No signature, revision, or open deadline is waiting on you across your organizations."
            }
          />
        ) : (
          sections.map((section) => (
            <div key={section.key}>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content-secondary">
                <span className={`flex size-5 items-center justify-center rounded-md ${section.accent}`}>
                  <section.icon className="size-3" aria-hidden />
                </span>
                {section.title}
                <span className="text-content-muted">({section.items.length})</span>
              </h4>
              <div className="mt-2 space-y-2">
                {section.items.map((t, i) => (
                  <TaskRow key={`${t.type}-${t.routeId ?? t.formKey}-${t.orgId}-${i}`} t={t} index={i} />
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}