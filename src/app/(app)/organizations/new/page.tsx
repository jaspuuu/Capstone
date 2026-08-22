import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { createOrganization } from "@/lib/actions/organizations";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { OrganizationForm } from "../organization-form";

export const metadata: Metadata = { title: "New organization" };

export default async function NewOrganizationPage() {
  await requirePermission("org.manage");

  const [colleges, departments, orgs] = await Promise.all([
    db.college.findMany({ orderBy: { name: "asc" } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.organization.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, acronym: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New organization"
        description="Register a student organization. Recognition is granted separately through the recognition lifecycle."
        breadcrumb={[
          { label: "Organizations", href: "/organizations" },
          { label: "New" },
        ]}
        actions={
          <Link
            href="/organizations"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>
        }
      />

      <Card>
        <CardHeader title="Organization profile" description="Basic information about the organization." />
        <CardContent>
          <OrganizationForm
            action={createOrganization}
            colleges={colleges.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
            departments={departments.map((d) => ({ id: d.id, name: d.name, collegeId: d.collegeId }))}
            organizations={orgs.map((o) => ({ id: o.id, label: o.acronym ?? o.name }))}
            submitLabel="Create organization"
          />
        </CardContent>
      </Card>
    </div>
  );
}
