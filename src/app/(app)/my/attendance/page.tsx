import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ATTENDANCE_STATUS_META } from "@/lib/constants";
import { formatDateTime, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
export const instant = false;

export const metadata: Metadata = { title: "My Attendance" };

export default async function MyAttendancePage() {
  const user = await requireUser();

  const records = await db.activityAttendance.findMany({
    where: { userId: user.id },
    include: {
      activity: {
        select: {
          id: true,
          title: true,
          startAt: true,
          organization: { select: { id: true, name: true, acronym: true } },
        },
      },
    },
    orderBy: { recordedAt: "desc" },
  });

  const counts = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="My Attendance"
        description="Your participation record across the organizations you joined — recorded by the organization's officers at each activity."
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "My Attendance" }]}
      />

      {records.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No attendance recorded yet"
          description="Once an organization marks you present at an activity, it will appear here."
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(ATTENDANCE_STATUS_META).map(([status, meta]) => (
              <Card key={status}>
                <CardContent className="p-4">
                  <p className="font-display text-3xl font-bold tracking-tabular-nums text-content">
                    {counts[status] ?? 0}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-content-secondary">{meta.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader icon={CalendarCheck} title="Attendance log" description={`${records.length} record${records.length === 1 ? "" : "s"} total.`} />
            <CardContent>
              <TableWrap>
                <THead>
                  <TH>Activity</TH>
                  <TH>Organization</TH>
                  <TH>Date &amp; time</TH>
                  <TH>Status</TH>
                  <TH>Recorded</TH>
                </THead>
                <tbody>
                  {records.map((r) => (
                    <TR key={r.id}>
                      <TD>
                        <span className="text-sm font-semibold text-content">{r.activity.title}</span>
                      </TD>
                      <TD>
                        <span className="text-sm text-content-secondary">
                          {r.activity.organization.acronym ?? r.activity.organization.name}
                        </span>
                      </TD>
                      <TD>
                        <span className="text-sm text-content-secondary">{formatDateTime(r.activity.startAt)}</span>
                      </TD>
                      <TD>
                        <Badge tone={ATTENDANCE_STATUS_META[r.status]?.tone ?? "neutral"}>
                          {ATTENDANCE_STATUS_META[r.status]?.label ?? r.status}
                        </Badge>
                      </TD>
                      <TD>
                        <span className="text-xs text-content-muted">{formatDate(r.recordedAt)}</span>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </TableWrap>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}