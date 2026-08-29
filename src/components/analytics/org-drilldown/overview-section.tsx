import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArcGauge, CoverageRing } from "@/components/ui/charts";
import { StatCard } from "@/components/ui/stat-card";
import { FIN_META } from "@/lib/analytics-ui";
import { Users } from "lucide-react";
import type { BadgeTone } from "@/lib/constants";
import type { FinancialStatus } from "@/lib/analytics";

export type DrillOverviewProps = {
  ay: string;
  rec: { kind: string; academicYear: string; status: string } | null;
  recMeta: { tone: BadgeTone; label: string } | null;
  compliance: number;
  financial: FinancialStatus;
  officerRatio: string;
  officers: number;
  members: number;
  activeMembers: number;
  inactiveMembers: number;
  metCount: number;
  checklistTotal: number;
  avgAttendance: number | null;
  attendanceCount: number;
};

export function DrillOverview(p: DrillOverviewProps) {
  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Recognition" />
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              {p.rec ? (
                <>
                  <Badge tone={p.recMeta?.tone ?? "neutral"}>{p.recMeta?.label ?? p.rec.status}</Badge>
                  <span className="text-xs text-content-secondary">
                    {p.rec.kind === "RENEWAL" ? "Renewal" : "Initial recognition"} · Cycle {p.rec.academicYear}
                  </span>
                </>
              ) : (
                <>
                  <Badge tone="neutral">No application this cycle</Badge>
                  <span className="text-xs text-content-secondary">Cycle {p.ay}</span>
                </>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <ArcGauge
                value={p.compliance}
                max={100}
                valueText={`${p.compliance}%`}
                ariaLabel={`Recognition compliance ${p.compliance}%`}
                size={130}
                tone="gold"
              />
              <p className="max-w-40 text-xs leading-relaxed text-content-secondary">
                Share of the SF-001 checklist fully satisfied for this cycle.
                Gold marks where measurable achievement stands.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Financial compliance" />
          <CardContent>
            <Badge tone={FIN_META[p.financial].tone}>{FIN_META[p.financial].label}</Badge>
            <p className="mt-2 text-xs text-content-secondary">
              CAPS scope: submitted / overdue / unsubmitted — not a treasury ledger.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Officer ratio" />
          <CardContent>
            <p className="font-display text-2xl font-bold text-content">
              {p.members > 0 ? `1 : ${p.officerRatio.replace("1 : ", "")}` : "—"}
            </p>
            <p className="mt-1 text-xs text-content-secondary">
              {p.officers} officer{p.officers === 1 ? "" : "s"} · {p.members} members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Attendance" />
          <CardContent>
            <p className="font-display text-2xl font-bold text-content">{p.avgAttendance != null ? `${p.avgAttendance}%` : "—"}</p>
            <p className="mt-1 text-xs text-content-secondary">
              {p.attendanceCount > 0
                ? `average capture across ${p.attendanceCount} recorded activit${p.attendanceCount === 1 ? "y" : "ies"}`
                : "no recorded attendance data yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
                Requirements coverage
              </p>
              <p className="mt-2 font-display text-3xl font-bold tracking-tight tabular-nums text-content">
                {p.metCount}
                <span className="text-sm font-semibold text-content-secondary"> / {p.checklistTotal}</span>
              </p>
              <p className="mt-1 text-xs text-content-muted">SF-001 accreditation checklist</p>
            </div>
            <CoverageRing
              value={p.metCount}
              total={p.checklistTotal}
              size={64}
              ariaLabel={`Requirements coverage ${Math.round((p.metCount / Math.max(p.checklistTotal, 1)) * 100)}%`}
            />
          </CardContent>
        </Card>
        <StatCard label="Members" value={`${p.members} (${p.activeMembers} active · ${p.inactiveMembers} inactive)`} icon={Users} iconTone="info" />
      </div>
    </>
  );
}