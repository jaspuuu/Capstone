import type { Metadata } from "next";
import Link from "next/link";
import { PlusCircle, Settings2 } from "lucide-react";
import { requirePermissionOrThrow } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { FINANCIAL_PROCESS_LABELS, financialSigningRoles } from "@/lib/financial";
import { SIGNATORY_LABELS } from "@/lib/form-routes";
import { createFinancialRequirement, toggleFinancialRequirement } from "@/lib/actions/financial";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, Chip } from "@/components/ui/badge";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

export const instant = false;

export const metadata: Metadata = { title: "Financial requirements" };

const PROCESSES = ["RECOGNITION", "RENEWAL", "ACTIVITY", "OTHER"] as const;

export default async function FinancialRequirementsPage() {
  await requirePermissionOrThrow("financial.manage");
  const requirements = await db.financialRequirement.findMany({
    include: {
      _count: { select: { submissions: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ process: "asc" }, { code: "asc" }],
  });

  const open = await db.financialSubmission.groupBy({
    by: ["requirementId"],
    _count: { _all: true },
    where: {
      requirementId: { in: requirements.map((r) => r.id) },
      status: { in: ["DRAFT", "INCOMPLETE", "SUBMITTED", "UNDER_REVIEW", "RESUBMITTED"] },
    },
  });
  const openByReq = new Map(open.map((o) => [o.requirementId, o._count._all]));

  return (
    <>
      <PageHeader
        title="Financial requirements"
        description="Requirements organizations must file each cycle, and the sequential signatory chain OSAS enforces (§14)."
        breadcrumb={[
          { label: "Financial", href: "/financial" },
          { label: "Requirements" },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Create */}
        <Card>
          <CardHeader icon={PlusCircle} title="New requirement" description="A blank chain uses the default President → Secretary → Senior Adviser → Dean → SOA → OSAS order." />
          <CardContent>
            <ActionForm action={createFinancialRequirement} submitLabel="Create requirement" className="space-y-3">
              <Field label="Code" htmlFor="req-code">
                <Input id="req-code" name="code" required placeholder="FINANCIAL_REPORT" />
              </Field>
              <Field label="Name" htmlFor="req-name">
                <Input id="req-name" name="name" required placeholder="Annual Financial Report" />
              </Field>
              <Field label="Process" htmlFor="req-process">
                <Select id="req-process" name="process" required defaultValue="RECOGNITION">
                  {PROCESSES.map((p) => (
                    <option key={p} value={p}>
                      {FINANCIAL_PROCESS_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Description" htmlFor="req-desc">
                <Textarea id="req-desc" name="description" rows={2} placeholder="What needs to be filed…" />
              </Field>
              <fieldset>
                <legend className="text-[11px] font-bold uppercase tracking-wide text-content-muted">
                  Signatory chain (in order served)
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {Object.entries(SIGNATORY_LABELS).map(([role, label]) => (
                    <label key={role} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-xs text-content hover:border-primary">
                      <input type="checkbox" name="signers" value={role} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
          </CardContent>
        </Card>

        {/* List */}
        <div className="space-y-4 lg:col-span-2">
          {requirements.map((r) => {
            const openCount = openByReq.get(r.id) ?? 0;
            return (
              <Card key={r.id}>
                <CardHeader
                  icon={Settings2}
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {r.name}
                      <Chip>{r.code}</Chip>
                      <Chip>{FINANCIAL_PROCESS_LABELS[r.process]}</Chip>
                      <Badge tone={r.isActive ? "success" : "neutral"}>
                        {r.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </span>
                  }
                  description={r.description ?? undefined}
                />
                <CardContent className="space-y-3">
                  <p className="text-xs text-content-secondary">
                    Chain · {financialSigningRoles(r).map((s) => SIGNATORY_LABELS[s]).join(" → ")}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-content-muted">
                      {r._count.submissions} submissions total
                      {openCount > 0 && <span className="ml-1 font-semibold text-warning">· {openCount} still open</span>}
                      {r.createdBy ? ` · created by ${r.createdBy.firstName} ${r.createdBy.lastName}` : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <ActionForm
                        action={toggleFinancialRequirement}
                        submitLabel={r.isActive ? "Deactivate" : "Reactivate"}
                        variant="outline"
                        footerClassName="mt-0"
                      >
                        <input type="hidden" name="id" value={r.id} />
                      </ActionForm>
                      {r.isActive && (
                        <Link
                          href="/financial?org=all"
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          View compliance →
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {requirements.length === 0 && (
            <Card>
              <CardContent>
                <p className="text-sm text-content-secondary">
                  No requirements yet — create the first one to start tracking financial compliance.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}