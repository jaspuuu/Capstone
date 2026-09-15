"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ChevronRight, ListChecks } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { QuickActionForm } from "@/components/action-form";
import { PriorityIcon } from "@/components/notifications/priority";
import { PRIORITY_META } from "@/components/notifications/priority";
import { OpenNotificationLink } from "@/components/notifications/notification-open";
import { cn } from "@/lib/utils";
import type { CenterRow } from "@/lib/notification-center";

/**
 * The bell: notification center popover. The snapshot is computed server-side
 * (layout) and passed down, so this component stays purely presentational.
 * Answering "what changed?" — Action Required first, then recent updates.
 */
export function NotificationCenterBell({
  unread,
  actionRequired,
  updates,
}: {
  unread: number;
  actionRequired: CenterRow[];
  updates: CenterRow[];
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "relative rounded-lg p-2 text-content-secondary transition-colors hover:bg-surface-secondary hover:text-content",
          open && "bg-surface-secondary text-content"
        )}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notification center"
          className="absolute top-full right-0 mt-2 z-[60] w-[21rem] overflow-hidden rounded-xl border border-line bg-surface shadow-pop sm:w-[24rem]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="flex items-center gap-2 text-sm font-bold text-content">
              <Bell className="size-4 text-primary" aria-hidden />
              Notifications
              {unread > 0 && (
                <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold leading-4 text-white">
                  {unread} unread
                </span>
              )}
            </p>
            {unread > 0 && (
              <QuickActionForm
                action={markAllNotificationsRead}
                hidden={{}}
                label=""
                variant="ghost"
              >
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-content-secondary">
                  <CheckCheck className="size-3.5" aria-hidden /> Mark all read
                </span>
              </QuickActionForm>
            )}
          </div>

          <div className="max-h-[24rem] overflow-y-auto scroll-thin">
            {/* Action required */}
            <div className="border-b border-line px-4 py-2">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-danger">
                <span className="size-1.5 rounded-full bg-danger" aria-hidden />
                Action required
              </p>
            </div>
            {actionRequired.length === 0 ? (
              <p className="px-4 py-2.5 text-xs text-content-muted">Nothing needs your attention right now.</p>
            ) : (
              <ul className="divide-y divide-line">
                {actionRequired.slice(0, 5).map((n) => (
                  <CompactRow key={n.id} n={n} />
                ))}
              </ul>
            )}

            {/* Updates */}
            <div className="border-b border-line px-4 py-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-content-secondary">
                Updates
              </p>
            </div>
            {updates.length === 0 ? (
              <p className="px-4 py-2.5 text-xs text-content-muted">No recent updates.</p>
            ) : (
              <ul className="divide-y divide-line">
                {updates.slice(0, 6).map((n) => (
                  <CompactRow key={n.id} n={n} />
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              <ListChecks className="size-4" aria-hidden />
              View all
            </Link>
            <Link
              href="/notifications/preferences"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-content-secondary hover:text-content"
            >
              Preferences <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function CompactRow({ n }: { n: CenterRow }) {
  const meta = PRIORITY_META[n.priority];
  const inner = (
    <div className="flex items-start gap-2.5 py-2">
      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", meta.iconTone)}>
        <PriorityIcon priority={n.priority} className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-content">{n.title}</p>
        <p className="mt-0.5 text-[10px] text-content-muted">{formatDateTime(n.createdAt)}</p>
      </div>
    </div>
  );
  return (
    <li>
      {n.link ? (
        <OpenNotificationLink id={n.id} href={n.link} className="block px-4 hover:bg-surface-secondary">
          {inner}
        </OpenNotificationLink>
      ) : (
        <div className="px-4">{inner}</div>
      )}
    </li>
  );
}