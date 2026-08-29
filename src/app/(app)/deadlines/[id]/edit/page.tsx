import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { updateDeadline } from "@/lib/actions/deadlines";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DeadlineForm } from "../../deadline-form";
export const instant = false;

export const metadata: Metadata = { title: "Edit deadline" };

export default async function EditDeadlinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("deadline.manage");
  const { id } = await params;

  const [deadline, colleges] = await Promise.all([
    db.deadline.findUnique({ where: { id }, include: { scopeCollege: true } }),
    db.college.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!deadline) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Edit deadline"
        description={deadline.name}
        breadcrumb={[{ label: "Deadlines", href: "/deadlines" }, { label: "Edit" }]}
        actions={
          <Link
            href="/deadlines"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>
        }
      />

      <Card>
        <CardHeader title="Deadline details" />
        <CardContent>
          <DeadlineForm
            action={updateDeadline}
            colleges={colleges.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
            initial={{
              id: deadline.id,
              name: deadline.name,
              process: deadline.process,
              academicYear: deadline.academicYear,
              startDate: deadline.startDate,
              dueDate: deadline.dueDate,
              scopeType: deadline.scopeType,
              scopeCollegeId: deadline.scopeCollegeId,
              instructions: deadline.instructions,
            }}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>
    </div>
  );
}
