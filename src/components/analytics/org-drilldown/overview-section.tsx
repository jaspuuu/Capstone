import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProportionBar } from "@/components/ui/charts";
import { StatCard } from "@/components/ui/stat-card";
import { FIN_META } from "@/lib/analytics-ui";
import { FileCheck, Users } from "lucide-react";
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
            <ProportionBar value={p.compliance} total={100} />
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
        <StatCard label="Requirements met" value={`${p.metCount} / ${p.checklistTotal}`} icon={FileCheck} iconTone="success" hint="SF-001 accreditation checklist" />
        <StatCard label="Members" value={`${p.members} (${p.activeMembers} active · ${p.inactiveMembers} inactive)`} icon={Users} iconTone="info" />
      </div>
    </>
  );
}