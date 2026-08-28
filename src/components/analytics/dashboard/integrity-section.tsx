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
        <ul className="space-y-3">
          {p.dataIssues.map((d) => (
            <li key={d.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-content">{d.title}</p>
                <Badge tone={d.severity === "HIGH" ? "danger" : d.severity === "MEDIUM" ? "warning" : "neutral"}>
                  {d.severity}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-content-secondary">{d.detail}</p>
              <p className="mt-2 rounded-lg bg-primary-light px-3 py-2 text-xs font-semibold text-primary">Rule: {d.why}</p>
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