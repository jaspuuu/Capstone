import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, orgScopeWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { createRecognition } from "@/lib/actions/recognition";
import { currentAcademicYear, nextAcademicYear } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RecognitionForm } from "../recognition-form";
export const instant = false;

export const metadata: Metadata = { title: "New recognition application" };

export default async function NewRecognitionPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string; kind?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "recognition.submit")) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <h1 className="font-display text-lg font-bold">Submissions are officer-managed</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Only organization officers (President or Secretary) or administrators can file
          recognition applications.
        </p>
      </Card>
    );
  }

  const sp = await searchParams;
  const ay = currentAcademicYear();

  // Officers file for orgs they belong to; admins for any org in scope.
  const isAdmin = can(user, "org.manage");
  const orgs = await db.organization.findMany({
    where: {
      AND: [
        orgScopeWhere(user),
        { archivedAt: null, status: "ACTIVE" },
      ],
    },
    select: {
      id: true,
      name: true,
      acronym: true,
      recognitions: { select: { academicYear: true, kind: true, status: true } },
    },
    orderBy: { name: "asc" },
  });

  const organizations = orgs.map((o) => ({
    id: o.id,
    label: o.acronym ? `${o.acronym} — ${o.name}` : o.name,
    hasCurrentApplication: o.recognitions.some((r) => r.academicYear === ay),
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New recognition application"
        description="File an initial application or a renewal. Saved as draft until submitted."
        breadcrumb={[{ label: "Recognition & Renewal", href: "/recognition" }, { label: "New" }]}
        actions={
          <Link
            href="/recognition"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>
        }
      />

      <Card>
        <CardHeader title="Application details" />
        <CardContent>
          <RecognitionForm
            action={createRecognition}
            organizations={organizations}
            initialOrgId={sp.organizationId}
            initialKind={sp.kind === "RENEWAL" ? "RENEWAL" : "INITIAL"}
            suggestedYear={sp.kind === "RENEWAL" ? nextAcademicYear(ay) : ay}
          />
        </CardContent>
      </Card>

      {!isAdmin && organizations.length === 0 && (
        <p className="mt-4 text-center text-sm text-content-muted">
          You are not currently registered as an officer of any active organization.
        </p>
      )}
    </div>
  );
}
