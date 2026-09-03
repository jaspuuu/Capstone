import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { REPORT_STATUS_META } from "@/lib/constants";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { PrintToolbar } from "@/components/forms/editable";
import { SfLetterhead } from "@/components/forms/sf-chrome";
export const instant = false;

export const metadata: Metadata = { title: "Accomplishment report record" };

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Official print record of an *accepted* accomplishment report — same
 * letterhead language as the SF forms, for archival in OSAS records.
 */
export default async function PrintReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const report = await db.accomplishmentReport.findUnique({
    where: { id },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          acronym: true,
          collegeId: true,
          college: { select: { name: true } },
        },
      },
      activityProposal: {
        select: {
          title: true,
          startAt: true,
          endAt: true,
          venue: true,
          expectedParticipants: true,
          estimatedBudget: true,
        },
      },
      decidedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!report) notFound();

  const [org, attachments] = await Promise.all([
    db.organization.findUnique({
      where: { id: report.organizationId },
      select: {
        members: {
          where: { isCurrent: true, position: "PRESIDENT" },
          select: { user: { select: { id: true, firstName: true, lastName: true } } },
          take: 1,
        },
        advisers: {
          where: { isCurrent: true },
          select: { adviser: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    }),
    db.attachment.findMany({
      where: { entityType: "AccomplishmentReport", entityId: report.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Scope enforcement mirrors the report detail page.
  if (!can(user, "org.manage") && user.role !== "DEAN") {
    const isMember = report.organizationId
      ? await db.organizationMember.findFirst({
          where: { organizationId: report.organizationId, userId: user.id, isCurrent: true },
          select: { id: true },
        })
      : null;
    const isAdviser =
      user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME"
        ? await db.adviserAssignment.findFirst({
            where: { adviserId: user.id, organizationId: report.organizationId, isCurrent: true },
          })
        : null;
    if (!isMember && !isAdviser) notFound();
  }
  if (user.role === "DEAN" && !can(user, "org.manage") && report.organization.collegeId !== user.collegeId) {
    notFound();
  }

  if (report.status !== "ACCEPTED") {
    return (
      <>
        <PrintToolbar backHref={`/reports/${report.id}`} title="Accomplishment report record" />
        <div className="mx-auto max-w-[210mm] p-8 text-center">
          <p className="text-lg font-bold">Not yet an official record</p>
          <p className="mt-2 text-sm">
            This report is <b>{REPORT_STATUS_META[report.status]?.label ?? report.status}</b>.
            Only accepted reports print as official records.
          </p>
        </div>
      </>
    );
  }

  const president = org?.members[0]?.user ?? null;
  const orgDisplay = report.organization.acronym
    ? `${report.organization.name} (${report.organization.acronym})`
    : report.organization.name;
  const fmt = (d: Date | null) => (d ? formatDate(d) : "—");

  return (
    <>
      <PrintToolbar backHref={`/reports/${report.id}`} title="Accomplishment report record" />
      <div className="sf-sheet">
        <SfLetterhead />

        <h1 className="mt-6 text-center font-bold">
          ACCOMPLISHMENT REPORT
        </h1>
        <p className="mt-1 text-center">
          <span className="font-bold">{orgDisplay}</span>
          {" · "}AY {report.academicYear}
        </p>
        {report.organization.college?.name && (
          <p className="text-center">{report.organization.college.name}</p>
        )}

        <table className="sf-table mt-5 w-full">
          <tbody>
            <tr>
              <th className="w-[34mm]">Report title</th>
              <td>{report.title}</td>
            </tr>
            <tr>
              <th>Activity held on</th>
              <td>{fmt(report.heldOn)}</td>
            </tr>
            {report.actualParticipants != null && (
              <tr>
                <th>Actual participants</th>
                <td>{report.actualParticipants}</td>
              </tr>
            )}
            {report.actualBudget != null && (
              <tr>
                <th>Actual expenses</th>
                <td>{formatMoney(report.actualBudget)}</td>
              </tr>
            )}
            <tr>
              <th>Status</th>
              <td>
                {REPORT_STATUS_META[report.status]?.label ?? report.status}
                {report.reviewedAt ? ` · accepted ${fmt(report.reviewedAt)}` : ""}
              </td>
            </tr>
            {report.decidedBy && (
              <tr>
                <th>Accepted by</th>
                <td>
                  {report.decidedBy.firstName} {report.decidedBy.lastName}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {report.activityProposal && (
          <>
            <h2 className="mt-5 font-bold">Planned activity</h2>
            <table className="sf-table mt-1 w-full">
              <tbody>
                <tr>
                  <th className="w-[34mm]">Proposed title</th>
                  <td>{report.activityProposal.title}</td>
                </tr>
                {report.activityProposal.startAt && (
                  <tr>
                    <th>Scheduled</th>
                    <td>
                      {fmt(report.activityProposal.startAt)}
                      {report.activityProposal.endAt &&
                        report.activityProposal.endAt.getTime() !== report.activityProposal.startAt.getTime() &&
                        ` → ${fmt(report.activityProposal.endAt)}`}
                    </td>
                  </tr>
                )}
                {report.activityProposal.venue && (
                  <tr>
                    <th>Venue</th>
                    <td>{report.activityProposal.venue}</td>
                  </tr>
                )}
                {report.activityProposal.expectedParticipants != null && (
                  <tr>
                    <th>Expected participants</th>
                    <td>{report.activityProposal.expectedParticipants}</td>
                  </tr>
                )}
                {report.activityProposal.estimatedBudget != null && (
                  <tr>
                    <th>Approved budget</th>
                    <td>{formatMoney(report.activityProposal.estimatedBudget)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        <h2 className="mt-5 font-bold">Narrative report</h2>
        <p className="mt-2 whitespace-pre-wrap text-justify leading-relaxed">{report.narrative}</p>

        {attachments.length > 0 && (
          <>
            <h2 className="mt-5 font-bold">Attached evidence ({attachments.length})</h2>
            <ul className="mt-1 list-inside list-disc">
              {attachments.map((a) => (
                <li key={a.id}>
                  {a.fileName}
                  <span className="text-content-secondary"> · {fileSize(a.sizeBytes)} · attached {formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-12 flex justify-between text-center text-[11pt]">
          <div>
            <p className="w-[55mm] border-t border-black pt-1">&nbsp;</p>
            <p>{president ? `${president.firstName.toUpperCase()} ${president.lastName.toUpperCase()}` : ""}</p>
            <p>President</p>
          </div>
          <div>
            <p className="w-[55mm] border-t border-black pt-1">&nbsp;</p>
            <p>
              {report.decidedBy
                ? `${report.decidedBy.firstName.toUpperCase()} ${report.decidedBy.lastName.toUpperCase()}`
                : ""}
            </p>
            <p>Accepted by, OSAS/College Review</p>
          </div>
        </div>

        <footer className="sf-footer mt-10 flex items-baseline justify-between text-[9pt]">
          <span>LSPU-OSAS · Accomplishment Report</span>
          <span>AY {report.academicYear}</span>
          <span>Generated {formatDate(new Date())}</span>
        </footer>
      </div>
    </>
  );
}