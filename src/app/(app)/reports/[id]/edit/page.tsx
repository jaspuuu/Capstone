import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission, requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { filingOrganizations } from "@/lib/filing";
import { currentAcademicYear } from "@/lib/utils";
import { participantsByOrganization } from "@/lib/organization-participants";
import { updateReport } from "@/lib/actions/reports";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ReportForm } from "../../report-form";
export const instant = false;

export const metadata: Metadata = { title: "Edit accomplishment report" };

export default async function EditReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("activity.submit");
  const user = await requireUser();
  const { id } = await params;

  const report = await db.accomplishmentReport.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          members: { where: { isCurrent: true }, select: { id: true, userId: true, position: true } },
        },
      },
      participants: { orderBy: [{ isOfficer: "desc" }, { name: "asc" }] },
    },
  });
  if (!report) notFound();
  if (report.status !== "DRAFT" && report.status !== "RETURNED") notFound();

  if (!can(user, "org.manage")) {
    const officer = report.organization.members.some(
      (m) =>
        m.userId === user.id && (m.position === "PRESIDENT" || m.position === "SECRETARY")
    );
    if (!officer) notFound();
  }

  const organizations = await filingOrganizations(user);

  // Expected participants from the currently linked proposal (form-side warning only).
  const linked = report.activityProposalId
    ? await db.activityProposal.findUnique({
        where: { id: report.activityProposalId },
        select: { expectedParticipants: true },
      })
    : null;

  // Approved proposals without reports whose M&E is Implemented — include the
  // currently linked one so the selection stays valid while editing.
  const proposals = await db.activityProposal.findMany({
    where: {
      status: "APPROVED",
      academicYear: currentAcademicYear(),
      OR: [
        { report: null, monitoring: { status: "IMPLEMENTED" } },
        { id: report.activityProposalId ?? "" },
      ],
    },
    include: { organization: { select: { acronym: true, name: true } } },
    orderBy: { startAt: "desc" },
  });

  const orgMembers = await participantsByOrganization([report.organizationId]);

  // Report participants snapshot member ids; map back to user ids so the
  // picker can pre-check rows that are still current members.
  const memberIdToUserId = new Map(
    report.organization.members.map((m) => [m.id, m.userId] as const)
  );
  const initialParticipantIds = report.participants
    .map((p) => memberIdToUserId.get(p.memberId ?? "") ?? "")
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Edit accomplishment report"
        description={report.title}
        breadcrumb={[{ label: "Accomplishment Reports", href: "/reports" }, { label: "Edit" }]}
        actions={
          <Link
            href={`/reports/${report.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>
        }
      />

      <Card>
        <CardHeader title="Report details" />
        <CardContent>
          <ReportForm
            action={updateReport}
            organizations={organizations}
            proposals={proposals.map((p) => ({
              id: p.id,
              label: `${p.title} — ${p.organization.acronym ?? p.organization.name}`,
              organizationId: p.organizationId,
            }))}
            orgMembers={orgMembers}
            initialParticipantIds={initialParticipantIds}
            initial={{
              id: report.id,
              organizationId: report.organizationId,
              activityProposalId: report.activityProposalId,
              title: report.title,
              narrative: report.narrative,
              heldOn: report.heldOn,
              duration: report.duration,
              location: report.location,
              conductedBy: report.conductedBy,
              actualParticipants: report.actualParticipants,
              actualBudget: report.actualBudget,
              budgetRemarks: report.budgetRemarks,
              expectedParticipants: linked?.expectedParticipants ?? null,
            }}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>
    </div>
  );
}
