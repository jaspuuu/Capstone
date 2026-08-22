import type { Metadata } from "next";
import { Building2, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { CollegeFields, InlineForm } from "./college-forms";
import { createCollege, createDepartment, updateCollege } from "@/lib/actions/colleges";

export const metadata: Metadata = { title: "Colleges & departments" };

export default async function CollegesPage() {
  await requirePermission("college.manage");

  const [colleges, deans, departments] = await Promise.all([
    db.college.findMany({
      include: {
        dean: true,
        _count: { select: { organizations: true, users: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ where: { role: "DEAN", isActive: true }, orderBy: { lastName: "asc" } }),
    db.department.findMany({ include: { college: { select: { code: true } } }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Colleges & departments"
        description="Academic units that scope deans, advisers and student organizations."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {colleges.length === 0 ? (
            <EmptyState icon={Building2} title="No colleges yet" description="Create the first academic unit to get started." />
          ) : (
            colleges.map((c) => (
              <Card key={c.id}>
                <CardHeader
                  title={`${c.name} (${c.code})`}
                  description={
                    c.dean ? `Dean: ${fullName(c.dean)}` : "No dean assigned"
                  }
                />
                <CardContent>
                  <InlineForm action={updateCollege} submitLabel="Save">
                    <input type="hidden" name="id" value={c.id} />
                    <CollegeFields
                      deans={deans.map((d) => ({ id: d.id, label: `${fullName(d)} — ${d.email}` }))}
                      initial={{ name: c.name, code: c.code, deanId: c.deanId }}
                    />
                  </InlineForm>
                  <p className="mt-3 flex flex-wrap gap-2 text-xs text-content-secondary">
                    <Badge tone="neutral">{c._count.organizations} organizations</Badge>
                    <Badge tone="neutral">{c._count.users} accounts</Badge>
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={Plus} title="Add a college" />
            <CardContent>
              <InlineForm action={createCollege} submitLabel="Create college">
                <CollegeFields deans={deans.map((d) => ({ id: d.id, label: `${fullName(d)} — ${d.email}` }))} />
              </InlineForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader icon={Plus} title="Add a department" />
            <CardContent>
              <InlineForm action={createDepartment} submitLabel="Create department">
                <Field label="Department name" htmlFor="d-name" required>
                  <Input id="d-name" name="name" required maxLength={160} placeholder="e.g. Information Technology" />
                </Field>
                <Field label="Code" htmlFor="d-code" required>
                  <Input id="d-code" name="code" required maxLength={12} placeholder="e.g. IT" className="uppercase" />
                </Field>
                <Field label="College" htmlFor="d-college" required>
                  <Select id="d-college" name="collegeId" required>
                    {colleges.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </Select>
                </Field>
              </InlineForm>
            </CardContent>
          </Card>

          {departments.length > 0 && (
            <Card>
              <CardHeader title={`Departments (${departments.length})`} />
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {departments.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      <span className="text-content">{d.name}</span>
                      <span className="text-xs whitespace-nowrap text-content-secondary">
                        {d.college.code}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
