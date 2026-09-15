"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ANALYTICS_VIEWS, type AnalyticsView } from "./views";

export { ANALYTICS_VIEWS, isAnalyticsView, type AnalyticsView } from "./views";

/**
 * Register view tabs for the six analytics panels. The active view lives in
 * the `view` query parameter so each panel is a shareable, deep-linkable URL
 * that survives reloads; the current filter set is always preserved.
 */
export function AnalyticsTabBar({
  active,
  alertCount,
  issueCount,
}: {
  active: AnalyticsView;
  alertCount: number;
  issueCount: number;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();

  function hrefFor(view: AnalyticsView) {
    const p = new URLSearchParams(sp.toString());
    if (view === "overview") p.delete("view");
    else p.set("view", view);
    const q = p.toString();
    return q ? `${pathname}?${q}` : pathname;
  }

  const badge = (view: AnalyticsView) =>
    view === "alerts"
      ? alertCount > 0
        ? { n: alertCount, className: "bg-gold-light text-primary-dark" }
        : null
      : view === "quality"
        ? issueCount > 0
          ? { n: issueCount, className: "bg-warning text-content" }
          : null
        : null;

  return (
    <nav
      aria-label="Analytics views"
      className="mb-6 grid grid-cols-2 gap-1.5 rounded-2xl border border-line-strong bg-surface p-1.5 shadow-card sm:grid-cols-3 xl:grid-cols-6"
    >
      {ANALYTICS_VIEWS.map((t) => {
        const isActive = t.id === active;
        const b = badge(t.id);
        return (
          <Link
            key={t.id}
            href={hrefFor(t.id)}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors",
              isActive
                ? "bg-primary text-white shadow-sm"
                : "text-content-secondary hover:bg-surface-secondary hover:text-content"
            )}
          >
            {t.label}
            {b && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  b.className
                )}
              >
                {b.n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}