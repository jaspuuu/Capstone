"use client";

import { useActionState, useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import type { ActionState } from "@/lib/actions/organizations";

type Option = { id: string; label: string };

export function OrganizationForm({
  action,
  colleges,
  departments,
  organizations,
  initial,
  students,
  advisers,
  founder,
  academicYear,
  mode = "edit",
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  colleges: Option[];
  departments: { id: string; name: string; collegeId: string }[];
  organizations: Option[];
  initial?: {
    id?: string;
    name?: string;
    acronym?: string | null;
    description?: string | null;
    type?: string;
    parentId?: string | null;
    collegeId?: string;
    departmentId?: string | null;
    foundedYear?: number | null;
  };
  /** §28: optional validated founding officers/adviser (create mode only). */
  students?: Option[];
  advisers?: Option[];
  /** §5: when an officer creates the org, they ARE the founding President. */
  founder?: { id: string; label: string };
  academicYear?: string;
  mode?: "create" | "edit";
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [type, setType] = useState(initial?.type ?? "INDEPENDENT");
  const [collegeId, setCollegeId] = useState(initial?.collegeId ?? "");

  const deptOptions = departments.filter((d) => !collegeId || d.collegeId === collegeId);

  return (
    <form action={formAction} className="space-y-5">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Organization name" htmlFor="name" required className="md:col-span-2">
          <Input
            id="name"
            name="name"
            required
            minLength={3}
            maxLength={160}
            defaultValue={initial?.name}
            placeholder="e.g. Association of Computer Science Students"
          />
        </Field>

        <Field label="Acronym" htmlFor="acronym" hint="Short form used across the system">
          <Input
            id="acronym"
            name="acronym"
            maxLength={24}
            defaultValue={initial?.acronym ?? ""}
            placeholder="e.g. ACSS"
          />
        </Field>

        <Field label="Organization type" htmlFor="type" required>
          <Select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            required
          >
            <option value="MOTHER">Mother Organization</option>
            <option value="CHILD">Sub-Organization (of a mother org)</option>
            <option value="INDEPENDENT">Independent Organization</option>
          </Select>
        </Field>

        {type === "CHILD" && (
          <Field label="Mother organization" htmlFor="parentId" required>
            <Select id="parentId" name="parentId" defaultValue={initial?.parentId ?? ""} required>
              <option value="">Select mother organization…</option>
              {organizations
                .filter((o) => o.id !== initial?.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </Select>
          </Field>
        )}

        <Field label="College" htmlFor="collegeId" required>
          <Select
            id="collegeId"
            name="collegeId"
            value={collegeId}
            onChange={(e) => setCollegeId(e.target.value)}
            required
          >
            <option value="">Select college…</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Department" htmlFor="departmentId" hint="Optional">
          <Select id="departmentId" name="departmentId" defaultValue={initial?.departmentId ?? ""}>
            <option value="">None</option>
            {deptOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Year founded" htmlFor="foundedYear" hint="Optional">
          <Input
            id="foundedYear"
            name="foundedYear"
            type="number"
            min={1900}
            max={2100}
            defaultValue={initial?.foundedYear ?? ""}
          />
        </Field>

        <Field
          label="Logo"
          htmlFor="logo"
          hint="PNG, JPEG, or WebP · up to 2 MB · optional"
        >
          <input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary-light file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-primary"
          />
        </Field>

        <Field label="Description" htmlFor="description" className="md:col-span-1">
          <Textarea
            id="description"
            name="description"
            maxLength={2000}
            defaultValue={initial?.description ?? ""}
            placeholder="Purpose, focus areas, membership…"
          />
        </Field>
      </div>

      {mode === "create" && (
        <div className="space-y-4 rounded-xl border border-line p-4">
          <div>
            <p className="text-sm font-bold text-content">Founding officers & adviser</p>
            <p className="mt-0.5 text-xs text-content-secondary">
              The President is registered as the first officer for AY{" "}
              {academicYear ?? "the current academic year"}; the adviser must be a Senior Adviser
              (Regular Faculty). You can adjust the rest later.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {founder ? (
              <Field label="President" hint="Registered as the founding President">
                <input type="hidden" name="presidentId" value={founder.id} />
                <div className="flex h-10 items-center rounded-lg border border-line-strong bg-surface-secondary px-3 text-sm font-semibold text-content">
                  {founder.label}
                </div>
              </Field>
            ) : (
              <Field label="President" htmlFor="presidentId">
                <Select id="presidentId" name="presidentId" defaultValue="">
                  <option value="">None yet</option>
                  {(students ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Secretary" htmlFor="secretaryId">
              <Select id="secretaryId" name="secretaryId" defaultValue="">
                <option value="">None yet</option>
                {(students ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Senior Adviser (Regular)" htmlFor="adviserId">
              <Select id="adviserId" name="adviserId" defaultValue="">
                <option value="">None yet</option>
                {(advisers ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
