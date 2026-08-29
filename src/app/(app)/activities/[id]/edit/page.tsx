import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission, requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { filingOrganizations } from "@/lib/filing";
import { updateActivity } from "@/lib/actions/activities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ActivityForm } from "../../activity-form";
export const instant = false;

export const metadata: Metadata = { title: "Edit activity proposal" };

export default async function EditActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("activity.submit");
  const user = await requireUser();
  const { id } = await params;

  const proposal = await db.activityProposal.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          members: { where: { isCurrent: true }, select: { userId: true, position: true } },
        },
      },
    },
  });
  if (!proposal) notFound();
  if (proposal.status !== "DRAFT" && proposal.status !== "RETURNED") notFound();

  if (!can(user, "org.manage")) {
    const officer = proposal.organization.members.some(
      (m) =>
        m.userId === user.id && (m.position === "PRESIDENT" || m.position === "SECRETARY")
    );
    if (!officer) notFound();
  }

  const organizations = await filingOrganizations(user);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Edit activity proposal"
        description={proposal.title}
        breadcrumb={[{ label: "Activity Proposals", href: "/activities" }, { label: "Edit" }]}
        actions={
          <Link
            href={`/activities/${proposal.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>
        }
      />

      <Card>
        <CardHeader title="Proposal details" />
        <CardContent>
          <ActivityForm
            action={updateActivity}
            organizations={organizations}
            initial={{
              id: proposal.id,
              organizationId: proposal.organizationId,
              title: proposal.title,
              description: proposal.description,
              objectives: proposal.objectives,
              venue: proposal.venue,
              startAt: proposal.startAt,
              endAt: proposal.endAt,
              scope: proposal.scope,
              estimatedBudget: proposal.estimatedBudget,
              expectedParticipants: proposal.expectedParticipants,
            }}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>
    </div>
  );
}
