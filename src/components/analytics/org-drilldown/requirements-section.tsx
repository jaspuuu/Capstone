import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NoData } from "@/components/analytics/analytics-parts";
import { formatDate } from "@/lib/utils";
import { requirementLabel, type RequirementItem } from "@/lib/analytics";

export type DrillRequirementsProps = {
  checklist: RequirementItem[];
  ay: string;
  deadlines: { id: string; name: string; dueDate: Date }[];
};

export function DrillRequirements(p: DrillRequirementsProps) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Requirement compliance" description="Which SF-001 items are still outstanding this cycle." />
        <CardContent className="space-y-3">
          {p.checklist.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-content">{requirementLabel(item.key)}</span>
              <Badge tone={item.met ? "success" : item.status === "RETURNED" ? "danger" : "neutral"}>
                {item.met ? "Submitted / Approved" : item.status === "REQUIRED" ? "Missing" : item.status}
              </Badge>
            </div>
          ))}
          <p className="pt-1 text-xs text-content-secondary">
            “Compliant” here means the tracked document actually exists — not merely that an application was filed.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Applicable deadlines" description={`Deadlines applying to this organization for AY ${p.ay}.`} />
        <CardContent>
          {p.deadlines.length > 0 ? (
            <ul className="space-y-2">
              {p.deadlines.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-content">{d.name}</span>
                  <span className="shrink-0 text-xs text-content-secondary">{formatDate(d.dueDate)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <NoData what="No active deadlines apply to this organization for the selected academic year." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}