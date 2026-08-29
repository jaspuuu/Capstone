import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission, requireUser } from "@/lib/auth/guards";
import { filingOrganizations } from "@/lib/filing";
import { createActivity } from "@/lib/actions/activities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ActivityForm } from "../activity-form";
export const instant = false;

export const metadata: Metadata = { title: "New activity proposal" };

export default async function NewActivityPage() {
  await requirePermission("activity.submit");
  const user = await requireUser();
  const organizations = await filingOrganizations(user);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New activity proposal"
        description="File a proposal for adviser endorsement and approval before the activity takes place."
        breadcrumb={[{ label: "Activity Proposals", href: "/activities" }, { label: "New" }]}
        actions={
          <Link
            href="/activities"
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
          <ActivityForm action={createActivity} organizations={organizations} submitLabel="Save proposal" />
        </CardContent>
      </Card>
    </div>
  );
}
