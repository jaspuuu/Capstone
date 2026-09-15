import { ShieldQuestion } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { QuickActionForm } from "@/components/action-form";
import { markNotificationRead, archiveNotification } from "@/lib/actions/notifications";
import { OpenNotificationLink } from "@/components/notifications/notification-open";
import { CATEGORY_LABELS, PRIORITY_META, PriorityIcon } from "@/components/notifications/priority";
import { cn } from "@/lib/utils";
import type { CenterRow } from "@/lib/notification-center";

/**
 * A single notification row shared by the full page. Clicking the main area
 * marks the row read and navigates (rows without a link render as plain text).
 * Rows that still need an explicit "Mark read" affordance show it for the
 * popover's archived-style cases only.
 */
export function NotificationRow({
  n,
  showActions = true,
  className,
}: {
  n: CenterRow;
  showActions?: boolean;
  className?: string;
}) {
  const meta = PRIORITY_META[n.priority];
  const content = (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <p
          className={cn(
            "text-sm leading-snug",
            n.readAt == null ? "font-bold text-content" : "font-medium text-content-secondary"
          )}
        >
          {n.title}
        </p>
        {n.groupCount > 1 && (
          <span
            className="rounded-full bg-surface-secondary px-1.5 py-0.5 text-[10px] font-bold text-content-secondary"
            title={`${n.groupCount} related events grouped`}
          >
            {n.groupCount}×
          </span>
        )}
      </div>
      {n.body && <p className="mt-0.5 text-xs leading-relaxed text-content-secondary">{n.body}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-content-muted">
        {n.orgName && (
          <span className="max-w-[220px] truncate font-semibold text-content-secondary">
            {n.orgAcronym ?? n.orgName}
          </span>
        )}
        <span>{CATEGORY_LABELS[n.category]}</span>
        <span>{formatDateTime(n.createdAt)}</span>
      </div>
      {n.reason && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-surface-secondary/70 px-2 py-1.5 text-[11px] leading-relaxed text-content-secondary">
          <ShieldQuestion className="mt-px size-3.5 shrink-0 text-content-muted" aria-hidden />
          {n.reason}
        </p>
      )}
    </div>
  );

  const main = n.link ? (
    <OpenNotificationLink
      id={n.id}
      href={n.link}
      className="group flex flex-1 items-start gap-3 px-4 py-3.5 sm:px-5"
    >
      {content}
    </OpenNotificationLink>
  ) : (
    <div className="flex flex-1 items-start gap-3 px-4 py-3.5 sm:px-5">{content}</div>
  );

  return (
    <li className={cn(n.readAt == null && "bg-primary-light/30", className)}>
      <div className="flex items-stretch">
        <span className="mt-4 flex shrink-0 items-center justify-center pl-4">
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              meta.iconTone
            )}
          >
            <PriorityIcon priority={n.priority} className="size-4" />
          </span>
        </span>
        {main}
        {showActions && (
          <div className="flex shrink-0 items-center gap-1.5 px-3">
            {n.readAt == null && (
              <QuickActionForm
                action={markNotificationRead}
                hidden={{ id: n.id }}
                label="Mark read"
                variant="ghost"
              >
                <span className="text-xs font-semibold text-content-secondary">Mark read</span>
              </QuickActionForm>
            )}
            <QuickActionForm
              action={archiveNotification}
              hidden={{ id: n.id }}
              label="Archive"
              variant="ghost"
            >
              <span className="text-xs font-semibold text-content-muted">Archive</span>
            </QuickActionForm>
          </div>
        )}
      </div>
    </li>
  );
}