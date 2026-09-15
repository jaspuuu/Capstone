import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/analytics/analytics-parts";
import type { DataIssue } from "@/lib/analytics";

export type AnalyticsIntegrityProps = {
  dataIssues: DataIssue[];
  ay: string;
};

export function AnalyticsIntegrity(p: AnalyticsIntegrityProps) {
  return (
    <SectionCard
      className="mt-6"
      title={`Data integrity (${p.dataIssues.length})`}
      description="Rule-based flags for inconsistent or orphaned records in the current scope — fixing these cleans the analytics inputs."
    >
      {p.dataIssues.length === 0 ? (
        <Alert tone="success" title="No data-quality flags">
          No active organization in your scope triggers an integrity rule for {p.ay}.
        </Alert>
      ) : (
        <ul className="divide-y divide-line">
          {p.dataIssues.map((d) => (
            <li key={d.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`size-2 shrink-0 rounded-full ${d.severity === "HIGH" ? "bg-danger" : d.severity === "MEDIUM" ? "bg-warning" : "bg-content-muted"}`}
                    aria-hidden
                  />
                  <p className="text-sm font-semibold text-content">{d.title}</p>
                </div>
                <Badge tone={d.severity === "HIGH" ? "danger" : d.severity === "MEDIUM" ? "warning" : "neutral"}>
                  {d.severity}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-content-secondary">{d.detail}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-content-muted">Rule — {d.why}</p>
              {d.href && (
                <div className="mt-2">
                  <Link href={d.href} className="text-xs font-semibold text-primary hover:underline">
                    Inspect →
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}