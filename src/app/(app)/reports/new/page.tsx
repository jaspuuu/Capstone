import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission, requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { filingOrganizations } from "@/lib/filing";
import { participantsByOrganization } from "@/lib/organization-participants";
import { createReport } from "@/lib/actions/reports";
import { currentAcademicYear } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ReportForm } from "../report-form";
export const instant = false;

export const metadata: Metadata = { title: "New accomplishment report" };

export default async function NewReportPage({
  searchParams,
}: {
  searchParams: Promise<{ proposal?: string; org?: string }>;
}) {
  await requirePermission("activity.submit");
  const user = await requireUser();
  const sp = await searchParams;
  const organizations = await filingOrganizations(user);

  // Approved proposals without reports whose M&E is marked Implemented (§24:
  // the strict gate), for the optional link dropdown.
  const proposals = await db.activityProposal.findMany({
    where: {
      status: "APPROVED",
      report: null,
      monitoring: { status: "IMPLEMENTED" },
      academicYear: currentAcademicYear(),
    },
    include: { organization: { select: { acronym: true, name: true } } },
    orderBy: { startAt: "desc" },
  });

  const orgMembers = await participantsByOrganization(organizations.map((o) => o.id));

  // Prefill from the activity page's "File report" link when present.
  const prefillProposal = sp.proposal
    ? proposals.find((p) => p.id === sp.proposal) ?? null
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New accomplishment report"
        description="Document a completed activity. Link an approved proposal or file it as an unplanned activity."
        breadcrumb={[{ label: "Accomplishment Reports", href: "/reports" }, { label: "New" }]}
        actions={
          <Link
            href="/reports"
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
            action={createReport}
            organizations={organizations}
            proposals={proposals.map((p) => ({
              id: p.id,
              label: `${p.title} — ${p.organization.acronym ?? p.organization.name}`,
              organizationId: p.organizationId,
            }))}
            orgMembers={orgMembers}
            initial={
              prefillProposal
                ? {
                    id: "",
                    organizationId: prefillProposal.organizationId,
                    activityProposalId: prefillProposal.id,
                    title: prefillProposal.title,
                    narrative: "",
                    heldOn: prefillProposal.startAt ?? new Date(),
                    actualParticipants: null,
                    actualBudget: null,
                    expectedParticipants: prefillProposal.expectedParticipants,
                  }
                : sp.org
                  ? {
                      id: "",
                      organizationId: sp.org,
                      activityProposalId: sp.proposal ?? null,
                      title: "",
                      narrative: "",
                      heldOn: new Date(),
                      actualParticipants: null,
                      actualBudget: null,
                    }
                  : undefined
            }
            submitLabel="Save report"
          />
        </CardContent>
      </Card>
    </div>
  );
}
