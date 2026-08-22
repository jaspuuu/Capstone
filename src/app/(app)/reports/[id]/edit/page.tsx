import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission, requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { filingOrganizations } from "@/lib/filing";
import { currentAcademicYear } from "@/lib/utils";
import { updateReport } from "@/lib/actions/reports";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ReportForm } from "../../report-form";

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
          members: { where: { isCurrent: true }, select: { userId: true, position: true } },
        },
      },
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

  // Approved proposals without reports — include the currently linked one so
  // the selection stays valid while editing.
  const proposals = await db.activityProposal.findMany({
    where: {
      status: "APPROVED",
      academicYear: currentAcademicYear(),
      OR: [{ report: null }, { id: report.activityProposalId ?? "" }],
    },
    include: { organization: { select: { acronym: true, name: true } } },
    orderBy: { startAt: "desc" },
  });

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
            initial={{
              id: report.id,
              organizationId: report.organizationId,
              activityProposalId: report.activityProposalId,
              title: report.title,
              narrative: report.narrative,
              heldOn: report.heldOn,
              actualParticipants: report.actualParticipants,
              actualBudget: report.actualBudget,
            }}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>
    </div>
  );
}
