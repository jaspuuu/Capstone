import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BarChart, LineChart } from "@/components/ui/charts";
import { NoData } from "@/components/analytics/analytics-parts";
import { deltaHint } from "@/lib/analytics-ui";
import { pctChange } from "@/lib/analytics";

export type CyclePoint = { label: string; value: number };

export type AnalyticsTrendsProps = {
  compTrend: CyclePoint[];
  compDelta: number | null;
  trends: {
    m: CyclePoint[];
    recs: CyclePoint[];
    acts: CyclePoint[];
    impl: CyclePoint[];
  };
};

export function AnalyticsTrends(p: AnalyticsTrendsProps) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-4">
      <Card className="lg:col-span-2">
        <CardHeader title="Accreditation compliance trend" description={deltaHint(p.compDelta)} />
        <CardContent>
          {p.compTrend.length > 0 ? (
            <LineChart data={p.compTrend} ariaLabel="Average compliance percentage per academic year" />
          ) : (
            <NoData what="Not enough completed requirement records across cycles." />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Membership per cycle" description={deltaHint(pctChange(p.trends.m))} />
        <CardContent>
          {p.trends.m.length > 0 ? (
            <BarChart data={p.trends.m} ariaLabel="Total members per academic year" />
          ) : (
            <NoData what="No membership data recorded yet." />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Activities & implementation" description="Planned activities and implementation rate per cycle." />
        <CardContent className="space-y-4">
          {p.trends.acts.length > 0 ? (
            <BarChart data={p.trends.acts} ariaLabel="Activity proposals filed per academic year" />
          ) : (
            <NoData what="No activity proposals recorded yet." />
          )}
          {p.trends.impl.length > 0 && (
            <LineChart data={p.trends.impl} ariaLabel="Activity implementation rate per academic year" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}