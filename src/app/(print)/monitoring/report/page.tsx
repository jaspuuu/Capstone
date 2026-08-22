import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { isAdviserOf, hasMembership } from "@/lib/forms-access";
import { currentAcademicYear, formatMoney } from "@/lib/utils";
import {
  attendanceRate,
  monitorOrg,
  type MonitoredActivity,
} from "@/lib/monitoring";
import { PrintToolbar } from "@/components/forms/editable";
import { FormOrgPicker } from "@/components/forms/org-picker";

export const metadata: Metadata = { title: "Activity Monitoring Report" };

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Part 8 output — "plan of activities monitoring reports": a system-generated
 * (not an official numbered SF form) print sheet summarizing one
 * organization's activity pipeline with evaluation columns for OSAS records.
 */
export default async function MonitoringReportPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; ay?: string }>;
}) {
  const user = await requireUser();
  const now = new Date();
  const { org: orgId, ay: ayParam } = await searchParams;
  const ay = /^\d{4}-\d{4}$/.test(ayParam ?? "") ? ayParam! : currentAcademicYear();
  if (!orgId) return <FormOrgPicker basePath="/monitoring/report" />;

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      acronym: true,
      collegeId: true,
      college: { select: { name: true } },
    },
  });
  if (!org) notFound();

  const isMember = await hasMembership(user.id, orgId);
  const isAdviser = await isAdviserOf(user, orgId);
  const isDean = user.role === "DEAN" && user.collegeId === org.collegeId;
  if (!can(user, "org.manage") && !isDean && !isAdviser && !isMember) notFound();

  const rowsRaw = await db.activityProposal.findMany({
    where: { organizationId: orgId, academicYear: ay },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      title: true,
      status: true,
      scope: true,
      venue: true,
      startAt: true,
      endAt: true,
      estimatedBudget: true,
      expectedParticipants: true,
      report: { select: { status: true, actualParticipants: true, actualBudget: true } },
      _count: { select: { attendanceRecords: true } },
    },
  });

  const monitored = monitorOrg(
    { id: org.id, name: org.name, acronym: org.acronym, collegeName: org.college?.name ?? null },
    rowsRaw.map((a): MonitoredActivity => ({
      id: a.id,
      title: a.title,
      status: a.status,
      scope: a.scope,
      venue: a.venue,
      startAt: a.startAt,
      endAt: a.endAt,
      estimatedBudget: a.estimatedBudget,
      actualBudget: a.report?.actualBudget ?? null,
      expectedParticipants: a.expectedParticipants,
      actualParticipants: a.report?.actualParticipants ?? null,
      attendanceCount: a._count.attendanceRecords,
      reportStatus: a.report?.status ?? null,
    })),
    now
  );

  return (
    <>
      <PrintToolbar backHref={`/organizations/${org.id}`} title="Activity Monitoring Report" />
      <div className="sf-sheet-flow mx-auto w-[210mm]">
        <header className="text-center leading-snug">
          <p className="text-[11pt]" style={{ fontFamily: 'Calibri, Carlito, "Segoe UI", sans-serif' }}>
            Republic of the Philippines
          </p>
          <p
            style={{
              fontFamily: '"Old English Text MT", "UnifrakturMaguntia", "Times New Roman", serif',
              fontSize: "14pt",
            }}
          >
            Laguna State Polytechnic University
          </p>
          <p className="text-[11pt]" style={{ fontFamily: 'Calibri, Carlito, "Segoe UI", sans-serif' }}>
            Province of Laguna
          </p>
          <p className="whitespace-nowrap text-[11pt] font-bold">
            OFFICE OF STUDENT AFFAIRS AND SERVICES
          </p>
        </header>

        <h1 className="mt-6 text-center text-[14pt] font-bold">PLAN OF ACTIVITIES MONITORING REPORT</h1>
        <p className="mt-1 text-center text-[12pt]">
          <span className="font-bold">{org.acronym ? `${org.name} (${org.acronym})` : org.name}</span>
          {" · "}
          AY {ay}
        </p>
        {monitored.collegeName && (
          <p className="text-center text-[12pt]">{monitored.collegeName}</p>
        )}

        <table className="mt-5 w-full border-collapse text-left text-[10.5pt] leading-snug">
          <thead>
            <tr className="border-b-2 border-black align-bottom">
              <th className="w-[26mm] py-1 font-normal">Date</th>
              <th className="py-1 font-normal">Activity / Venue</th>
              <th className="w-[24mm] py-1 text-center font-normal">Status</th>
              <th className="w-[22mm] py-1 text-right font-normal">Budget</th>
              <th className="w-[18mm] py-1 text-center font-normal">Attend.</th>
              <th className="w-[16mm] py-1 text-center font-normal">Report</th>
            </tr>
          </thead>
          <tbody>
            {monitored.activities.map((a) => {
              const rate = attendanceRate(a);
              return (
                <tr key={a.id} className="border-b border-black/60 align-top">
                  <td className="py-1.5 pr-2">
                    {fmtDate(a.startAt)}
                    {a.endAt.getTime() - a.startAt.getTime() > 86_400_000 ? ` – ${fmtDate(a.endAt)}` : ""}
                  </td>
                  <td className="py-1.5 pr-2">
                    {a.title}
                    {a.venue ? <span className="block text-[9.5pt]">Venue: {a.venue}</span> : null}
                  </td>
                  <td className="py-1.5 text-center capitalize">{a.status.toLowerCase()}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {a.actualBudget != null ? formatMoney(a.actualBudget) : a.estimatedBudget != null ? `est. ${formatMoney(a.estimatedBudget)}` : "—"}
                  </td>
                  <td className="py-1.5 text-center tabular-nums">{rate != null ? `${rate}%` : "—"}</td>
                  <td className="py-1.5 text-center">{a.reportStatus ? "Yes" : a.endAt.getTime() < now.getTime() ? "No" : "—"}</td>
                </tr>
              );
            })}
            {monitored.activities.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center italic">
                  No activities filed for this academic year.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black">
              <td colSpan={3} className="py-1.5 font-bold">
                Summary: {monitored.planned} planned · {monitored.approved} approved · {monitored.completed} completed ·{" "}
                {monitored.endedWithoutReport.length} ended without report
              </td>
              <td className="py-1.5 text-right font-bold tabular-nums">{formatMoney(monitored.budgetActual)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>

        <div className="mt-10 flex justify-between text-center text-[11pt]">
          <div>
            <p className="w-[55mm] border-t border-black pt-1">&nbsp;</p>
            <p>Prepared by, OSAS Staff</p>
          </div>
          <div>
            <p className="w-[55mm] border-t border-black pt-1">&nbsp;</p>
            <p>Certified correct, Organization Adviser</p>
          </div>
        </div>

        <footer className="sf-footer mt-8 flex items-baseline justify-between text-[9pt]">
          <span>LSPU-OSAS · Activity Monitoring Report</span>
          <span>AY {ay}</span>
          <span>Generated {fmtDate(now)}</span>
        </footer>
      </div>
    </>
  );
}
