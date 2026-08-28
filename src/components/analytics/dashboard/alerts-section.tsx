import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/analytics/analytics-parts";
import { PRIORITY_META, type AnalyticsAlert } from "@/lib/analytics";

export type AnalyticsAlertsProps = {
  alerts: AnalyticsAlert[];
  priority: Record<string, number>;
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
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["CRITICAL", "HIGH", "MEDIUM", "INFO"] as const).map((pr) => (
              <Badge key={pr} tone={PRIORITY_META[pr].tone}>
                {PRIORITY_META[pr].label} {p.priority[pr]}
              </Badge>
            ))}
          </div>
          <ul className="space-y-3">
            {p.alerts.map((a) => (
              <li key={a.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-content-muted" aria-hidden />
                    <p className="text-sm font-bold text-content">{a.title}</p>
                  </div>
                  <Badge tone={PRIORITY_META[a.priority].tone}>{PRIORITY_META[a.priority].label}</Badge>
                </div>
                <p className="mt-1 text-xs text-content-secondary">{a.detail}</p>
                <p className="mt-2 rounded-lg bg-primary-light px-3 py-2 text-xs font-semibold text-primary">Why: {a.why}</p>
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
        </>
      )}
    </SectionCard>
  );
}