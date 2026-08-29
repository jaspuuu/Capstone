import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { updateOrganization } from "@/lib/actions/organizations";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { OrganizationForm } from "../../organization-form";
export const instant = false;

export const metadata: Metadata = { title: "Edit organization" };

export default async function EditOrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [org, colleges, departments, orgs] = await Promise.all([
    db.organization.findUnique({
      where: { id },
      include: { parent: { select: { id: true } } },
    }),
    db.college.findMany({ orderBy: { name: "asc" } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.organization.findMany({
      where: { archivedAt: null, NOT: { id } },
      select: { id: true, name: true, acronym: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!org) notFound();

  // §5: admins always edit; an officer edits only their own DRAFT or RETURNED
  // application — never once the application is under review.
  const isAdmin = can(user, "org.manage");
  const isOfficer =
    user.role === "PRESIDENT" || user.role === "SECRETARY";
  const inEditState = org.applicationStatus === "DRAFT" || org.applicationStatus === "RETURNED";
  if (!isAdmin) {
    if (!isOfficer || !inEditState) redirect("/forbidden");
    const membership = await db.organizationMember.findFirst({
      where: {
        organizationId: id,
        userId: user.id,
        position: { in: ["PRESIDENT", "SECRETARY"] },
        isCurrent: true,
        status: "ACTIVE",
      },
    });
    if (!membership) redirect("/forbidden");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Edit organization"
        description={org.name}
        breadcrumb={[
          { label: "Organizations", href: "/organizations" },
          { label: org.acronym ?? org.name, href: `/organizations/${org.id}` },
          { label: "Edit" },
        ]}
        actions={
          <Link
            href={`/organizations/${org.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to profile
          </Link>
        }
      />

      <Card>
        <CardHeader title="Organization profile" />
        <CardContent>
          <OrganizationForm
            action={updateOrganization}
            colleges={colleges.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
            departments={departments.map((d) => ({ id: d.id, name: d.name, collegeId: d.collegeId }))}
            organizations={orgs.map((o) => ({ id: o.id, label: o.acronym ?? o.name }))}
            initial={{
              id: org.id,
              name: org.name,
              acronym: org.acronym,
              description: org.description,
              type: org.type,
              parentId: org.parent?.id ?? null,
              collegeId: org.collegeId,
              departmentId: org.departmentId,
              foundedYear: org.foundedYear,
            }}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>
    </div>
  );
}
