import type { Metadata } from "next";
import Link from "next/link";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickActionForm } from "@/components/action-form";
export const instant = false;

export const metadata: Metadata = { title: "Notifications" };

const TYPE_STYLES: Record<string, string> = {
  DEADLINE_NEW: "bg-warning-light text-warning",
  DEADLINE_UPDATED: "bg-warning-light text-warning",
  APPLICATION_RETURNED: "bg-danger-light text-danger",
  APPLICATION_REJECTED: "bg-danger-light text-danger",
  APPLICATION_APPROVED: "bg-success-light text-success",
  RECOGNITION_CONFERRED: "bg-success-light text-success",
  ACTIVITY_RETURNED: "bg-danger-light text-danger",
  ACTIVITY_REJECTED: "bg-danger-light text-danger",
  ACTIVITY_APPROVED: "bg-success-light text-success",
  REPORT_RETURNED: "bg-danger-light text-danger",
  REPORT_ACCEPTED: "bg-success-light text-success",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => n.readAt == null).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread notification${unread > 1 ? "s" : ""}.` : "You're all caught up."}
        breadcrumb={[{ label: "Home", href: "/dashboard" }, { label: "Notifications" }]}
        actions={
          unread > 0 ? (
            <QuickActionForm action={markAllNotificationsRead} hidden={{}} label="" variant="outline">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <CheckCheck className="size-4" aria-hidden /> Mark all read
              </span>
            </QuickActionForm>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="pt-2">
          {notifications.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title="No notifications yet"
              description="Deadline announcements and review decisions on your organization's submissions will appear here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {notifications.map((n) => {
                const tone = TYPE_STYLES[n.type] ?? "bg-surface-secondary text-content-secondary";
                const row = (
                  <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                    <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                      <Bell className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${n.readAt == null ? "font-bold text-content" : "font-medium text-content-secondary"}`}>
                        {n.title}
                        {n.readAt == null && (
                          <span className="ml-2 inline-block size-2 rounded-full bg-primary align-middle" aria-label="Unread" />
                        )}
                      </p>
                      {n.body && <p className="mt-0.5 text-xs leading-relaxed text-content-secondary">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-content-muted">{formatDateTime(n.createdAt)}</p>
                    </div>
                    {n.link && (
                      <span className="hidden shrink-0 items-center self-center text-xs font-semibold text-primary sm:inline">
                        Open →
                      </span>
                    )}
                  </div>
                );
                return (
                  <li key={n.id} className={n.readAt == null ? "bg-primary-light/30" : ""}>
                    {n.link ? (
                      <div className="flex items-center">
                        <Link href={n.link} className="min-w-0 flex-1 hover:bg-surface-secondary">
                          {row}
                        </Link>
                        {n.readAt == null && (
                          <QuickActionForm
                            action={markNotificationRead}
                            hidden={{ id: n.id }}
                            label=""
                            variant="ghost"
                            className="mr-3"
                          >
                            <span className="text-xs font-semibold text-content-secondary">Mark read</span>
                          </QuickActionForm>
                        )}
                      </div>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-content-muted">
        Need something specific? Deadlines are also listed on the{" "}
        <Link href="/deadlines" className="font-semibold text-primary hover:underline">Deadlines page</Link>.
      </p>
    </>
  );
}
