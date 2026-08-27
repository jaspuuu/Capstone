import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { createDeadline } from "@/lib/actions/deadlines";
import { currentAcademicYear } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DeadlineForm } from "../deadline-form";

export const metadata: Metadata = { title: "New deadline" };

export default async function NewDeadlinePage() {
  await requirePermission("deadline.manage");
  const colleges = await db.college.findMany({ orderBy: { name: "asc" } });
  const ay = currentAcademicYear();

  const start = new Date();
  const due = new Date(start.getTime() + 30 * 86_400_000);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New deadline"
        description="Published deadlines drive the relevant workflows across the system."
        breadcrumb={[{ label: "Deadlines", href: "/deadlines" }, { label: "New" }]}
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
            action={createDeadline}
            colleges={colleges.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
            initial={{
              id: "",
              name: "",
              process: "RECOGNITION",
              academicYear: ay,
              startDate: start,
              dueDate: due,
              scopeType: "ALL",
              scopeCollegeId: null,
              instructions: null,
            }}
            submitLabel="Publish deadline"
          />
        </CardContent>
      </Card>
    </div>
  );
}
