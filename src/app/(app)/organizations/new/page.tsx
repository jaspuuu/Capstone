import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { createOrganization } from "@/lib/actions/organizations";
import { currentAcademicYear } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { OrganizationForm } from "../organization-form";

export const metadata: Metadata = { title: "New organization" };

export default async function NewOrganizationPage() {
  const user = await requirePermission("org.submit");
  const isOfficerCreator = user.role === "PRESIDENT" || user.role === "SECRETARY";

  const [colleges, departments, orgs, students, advisers] = await Promise.all([
    db.college.findMany({ orderBy: { name: "asc" } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.organization.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, acronym: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { isActive: true, role: { in: ["MEMBER", "PRESIDENT", "SECRETARY"] } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
    }),
    db.user.findMany({
      where: { isActive: true, role: "ADVISER_REGULAR" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
    }),
  ]);
  const ay = currentAcademicYear();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New organization"
        description={
          isOfficerCreator
            ? "Create your organization's application. You will be registered as its founding President; you can complete it later — recognition is only granted after the full review chain."
            : "Register a student organization application. The President completes and files it; recognition is granted only after the full review chain."
        }
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
        <CardHeader title="Organization application" description="Basic information about the organization." />
        <CardContent>
          <OrganizationForm
            action={createOrganization}
            mode="create"
            academicYear={ay}
            colleges={colleges.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
            departments={departments.map((d) => ({ id: d.id, name: d.name, collegeId: d.collegeId }))}
            organizations={orgs.map((o) => ({ id: o.id, label: o.acronym ?? o.name }))}
            students={students.map((s) => ({ id: s.id, label: `${s.firstName} ${s.lastName}` }))}
            advisers={advisers.map((a) => ({ id: a.id, label: `${a.firstName} ${a.lastName}` }))}
            founder={
              isOfficerCreator
                ? { id: user.id, label: `${user.firstName} ${user.lastName} (you)` }
                : undefined
            }
            submitLabel="Create draft application"
          />
        </CardContent>
      </Card>
    </div>
  );
}
