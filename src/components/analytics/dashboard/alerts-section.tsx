import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/analytics/analytics-parts";
import { PRIORITY_META, type AnalyticsAlert } from "@/lib/analytics";

export type AnalyticsAlertsProps = {
  alerts: AnalyticsAlert[];
  priority: Record<string, number>;
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-danger",
  HIGH: "bg-warning",
  MEDIUM: "bg-info",
  INFO: "bg-content-muted",
};

export function AnalyticsAlerts(p: AnalyticsAlertsProps) {
  return (
    <SectionCard
      title="Alerts & recommendations"
      description="Every item is emitted by an explicit fixed rule; the reason each alert exists is shown alongside the recommended administrative action."
    >
      {p.alerts.length === 0 ? (
        <Alert tone="success" title="No active alerts">
          No organization currently meets any configured rule threshold in your scope.
        </Alert>
      ) : (
        <ul className="divide-y divide-line">
          {p.alerts.map((a) => (
            <li key={a.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className={`size-2 shrink-0 rounded-full ${PRIORITY_DOT[a.priority]}`} aria-hidden />
                  <p className="text-sm font-semibold text-content">{a.title}</p>
                </div>
                <Badge tone={PRIORITY_META[a.priority].tone}>{PRIORITY_META[a.priority].label}</Badge>
              </div>
              <p className="mt-1 text-xs text-content-secondary">{a.detail}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-content-muted">Why — {a.why}</p>
              {a.href && (
                <div className="mt-2">
                  <Link href={a.href} className="text-xs font-semibold text-primary hover:underline">
                    View details →
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {p.alerts.length > 0 && (
        <p className="mt-4 border-t border-line pt-3 text-xs text-content-muted">
          {(["CRITICAL", "HIGH", "MEDIUM", "INFO"] as const)
            .map((pr) => `${PRIORITY_META[pr].label} ${p.priority[pr]}`)
            .join(" · ")}
        </p>
      )}
    </SectionCard>
  );
}