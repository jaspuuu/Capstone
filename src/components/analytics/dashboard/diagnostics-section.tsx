import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HBar, NoData } from "@/components/analytics/analytics-parts";

export type AnalyticsDiagnosticsProps = {
  missedRows: { label: string; value: number }[];
  activeOrgCount: number;
  workflowDelays: { stage: string; days: number }[];
  full: boolean;
  bottleneckList: { label: string; count: number }[];
};

export function AnalyticsDiagnostics(p: AnalyticsDiagnosticsProps) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader title="Most frequently missed requirements" description="SF-001 items still missing across active organizations in your scope." />
        <CardContent className="space-y-4">
          {p.missedRows.length > 0 ? (
            p.missedRows.map((r) => (
              <HBar
                key={r.label}
                label={r.label}
                percent={Math.round((r.value / p.activeOrgCount) * 100)}
                rightText={`${r.value}/${p.activeOrgCount} orgs`}
              />
            ))
          ) : (
            <NoData what="No checklist items are currently missing." />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Workflow stage delays" description="Average calendar days between recorded milestones on accreditation applications (only configured stages)." />
        <CardContent>
          {p.workflowDelays.length > 0 ? (
            <dl className="space-y-3">
              {p.workflowDelays.map((s) => (
                <div key={s.stage} className="flex items-center justify-between gap-2 rounded-xl border border-line px-4 py-3">
                  <dt className="text-sm font-medium text-content-secondary">{s.stage}</dt>
                  <dd className="font-display text-lg font-bold text-content tabular-nums">
                    {s.days}
                    <span className="ml-1 text-xs font-medium text-content-secondary">days</span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <NoData what="No recognition workflows have recorded timestamps in this scope yet." />
          )}
          {!p.full && <p className="mt-3 text-xs text-content-muted">Shown for your scope.</p>}
        </CardContent>
      </Card>
      {p.full && (
        <Card>
          <CardHeader title="Document bottlenecks" description="Signature-routed forms currently awaiting action, by signatory role." />
          <CardContent>
            {p.bottleneckList.length > 0 ? (
              <dl className="space-y-3">
                {p.bottleneckList.map((b) => (
                  <div key={b.label} className="flex items-center justify-between gap-2 rounded-xl border border-line px-4 py-3">
                    <dt className="text-sm font-medium text-content-secondary">{b.label}</dt>
                    <dd className="font-display text-lg font-bold text-content tabular-nums">{b.count}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <NoData what="No documents are currently parked at a signatory." />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}