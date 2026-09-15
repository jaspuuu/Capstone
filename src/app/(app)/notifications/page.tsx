import type { Metadata } from "next";
import Link from "next/link";
import { BellOff, CheckCheck, Settings2 } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { getNotificationFeed, getNotificationStats } from "@/lib/notification-center";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickActionForm } from "@/components/action-form";
import { NotificationRow } from "@/components/notifications/notification-row";
import { PRIORITY_META } from "@/components/notifications/priority";
import { cn } from "@/lib/utils";
export const instant = false;

export const metadata: Metadata = { title: "Notifications" };

type View = "all" | "action" | "activities" | "announcements";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: rawView } = await searchParams;
  const view: View =
    rawView === "action" || rawView === "activities" || rawView === "announcements"
      ? rawView
      : "all";
  const user = await requireUser();
  const [feed, actionFeed, stats] = await Promise.all([
    getNotificationFeed(user.id),
    view === "action" ? getNotificationFeed(user.id, { scoped: true }) : null,
    getNotificationStats(user.id),
  ]);

  // Tab scopes are mutually exclusive — ACTION_REQUIRED first, then
  // activity-type categories (ACTIVITY/MEMBERSHIP/APPROVAL/REVISION/SIGNATURE),
  // then everything else as announcements.
  const ACTIVITY_CATEGORIES = ["ACTIVITY", "MEMBERSHIP", "APPROVAL", "REVISION", "SIGNATURE"] as const;
  const actionItems = actionFeed ?? feed.filter((n) => n.priority === "ACTION_REQUIRED");
  const activityItems = feed.filter((n) => !actionItems.includes(n) && ACTIVITY_CATEGORIES.includes(n.category as never));
  const announcementItems = feed.filter((n) => !actionItems.includes(n) && !activityItems.includes(n));

  const visible =
    view === "action"
      ? actionItems
      : view === "activities"
        ? activityItems
        : view === "announcements"
          ? announcementItems
          : feed;

  const tabs: { key: View; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "action", label: "Action required", count: actionItems.length },
    { key: "activities", label: "Activities", count: activityItems.length },
    { key: "announcements", label: "Announcements", count: announcementItems.length },
  ];

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          stats.unread > 0
            ? `${stats.unread} unread — ${
                stats.actionRequired > 0
                  ? `${stats.actionRequired} need${stats.actionRequired === 1 ? "s" : ""} your action.`
                  : "everything else is updates."
              }`
            : "You're all caught up."
        }
        breadcrumb={[{ label: "Home", href: "/dashboard" }, { label: "Notifications" }]}
        actions={
          stats.unread > 0 ? (
            <QuickActionForm action={markAllNotificationsRead} hidden={{}} label="" variant="outline">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <CheckCheck className="size-4" aria-hidden /> Mark all read
              </span>
            </QuickActionForm>
          ) : undefined
        }
      />

      {/* Priority legend */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-xs text-content-secondary">
        <span className="font-bold uppercase tracking-widest text-content-muted">Priority</span>
        {(["ACTION_REQUIRED", "ATTENTION", "INFO", "SUCCESS"] as const).map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", PRIORITY_META[p].dot)} aria-hidden />
            {PRIORITY_META[p].label}
          </span>
        ))}
        <Link
          href="/notifications/preferences"
          className="ml-auto inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
        >
          <Settings2 className="size-3.5" aria-hidden /> Preferences
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Filter notifications">
        {tabs.map((t) => {
          const active = view === t.key;
          return (
            <Link
              key={t.key}
              href={`/notifications${t.key === "all" ? "" : `?view=${t.key}`}`}
              role="tab"
              aria-selected={active}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors",
                active ? "bg-primary text-white shadow-sm" : "text-content-secondary hover:bg-surface-secondary hover:text-content"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  active ? "bg-white/20 text-white" : "bg-surface-secondary text-content-muted"
                )}
              >
                {t.count}
              </span>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-2">
          {visible.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title={view === "action" ? "No action required" : "No notifications yet"}
              description={
                view === "action"
                  ? "When something needs your signature, review or decision it will appear here in red."
                  : "Deadline reminders and review decisions on your submissions will appear here."
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((n) => (
                <NotificationRow key={n.id} n={n} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {feed.length === 0 && (
        <p className="mt-4 text-xs text-content-muted">
          Deadlines are also listed on the{" "}
          <Link href="/deadlines" className="font-semibold text-primary hover:underline">Deadlines page</Link>.
        </p>
      )}
    </>
  );
}