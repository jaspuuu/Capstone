import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { createUser } from "@/lib/actions/users";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { UserForm } from "../user-form";
export const instant = false;

export const metadata: Metadata = { title: "New user account" };

export default async function NewUserPage() {
  await requirePermission("users.manage");
  const [colleges, departments] = await Promise.all([
    db.college.findMany({ orderBy: { name: "asc" } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New user account"
        description="Accounts inherit permissions from their system role."
        breadcrumb={[{ label: "User accounts", href: "/users" }, { label: "New" }]}
        actions={
          <Link
            href="/users"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>
        }
      />

      <Card>
        <CardHeader title="Account details" />
        <CardContent>
          <UserForm
            action={createUser}
            colleges={colleges.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
            departments={departments.map((d) => ({ id: d.id, name: d.name, collegeId: d.collegeId }))}
            submitLabel="Create account"
          />
        </CardContent>
      </Card>
    </div>
  );
}
