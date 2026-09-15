import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { currentAcademicYear } from "@/lib/utils";
import { canUseOrgForm } from "@/lib/forms-access";
import { FormOrgPicker } from "@/components/forms/org-picker";
import { FormWorkspace } from "@/components/forms/form-workspace";
export const instant = false;

export const metadata: Metadata = { title: "SF-006 · Certification" };

export default async function Sf006Page({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; ay?: string }>;
}) {
  const user = await requireUser();
  const { org: orgId, ay: ayParam } = await searchParams;
  const ay = /^\d{4}-\d{4}$/.test(ayParam ?? "") ? ayParam! : currentAcademicYear();
  if (!orgId) return <FormOrgPicker basePath="/forms/sf-006" />;

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, collegeId: true },
  });
  if (!org) notFound();
  if (!(await canUseOrgForm(user, org))) notFound();

  return <FormWorkspace formKey="SF006" orgId={org.id} ay={ay} backHref={`/organizations/${org.id}`} />;
}