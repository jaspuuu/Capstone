import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { resetPassword, updateUser } from "@/lib/actions/users";
import { formatDateTime, fullName } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResetPasswordForm, UserForm } from "../../user-form";

export const metadata: Metadata = { title: "Edit user account" };

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("users.manage");
  const { id } = await params;

  const [user, colleges, departments] = await Promise.all([
    db.user.findUnique({ where: { id } }),
    db.college.findMany({ orderBy: { name: "asc" } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!user) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Edit user account"
        description={`${fullName(user)} · ${user.email}`}
        breadcrumb={[{ label: "User accounts", href: "/users" }, { label: "Edit" }]}
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

      <div className="space-y-6">
        <Card>
          <CardHeader title="Account details" description={`Last sign-in: ${formatDateTime(user.lastLoginAt)}`} />
          <CardContent>
            <UserForm
              action={updateUser}
              colleges={colleges.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
              departments={departments.map((d) => ({ id: d.id, name: d.name, collegeId: d.collegeId }))}
              initial={{
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                middleName: user.middleName,
                role: user.role,
                collegeId: user.collegeId,
                departmentId: user.departmentId,
                studentNumber: user.studentNumber,
                positionTitle: user.positionTitle,
                isViewOnly: user.isViewOnly,
              }}
              submitLabel="Save changes"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader icon={KeyRound} title="Reset password" />
          <CardContent>
            <ResetPasswordForm action={resetPassword} userId={user.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
