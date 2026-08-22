"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/actions/colleges";

export function InlineForm({
  action,
  children,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {children}
      <SubmitButton size="sm" pendingLabel="Saving…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

export function CollegeFields({
  deans,
  initial,
}: {
  deans: { id: string; label: string }[];
  initial?: { name?: string; code?: string; deanId?: string | null };
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="College name" htmlFor={initial ? `cn-${initial.code}` : "c-name"} required>
          <Input id={initial ? `cn-${initial.code}` : "c-name"} name="name" required maxLength={160} defaultValue={initial?.name} />
        </Field>
        <Field label="Code" htmlFor={initial ? `cc-${initial.code}` : "c-code"} required>
          <Input
            id={initial ? `cc-${initial.code}` : "c-code"}
            name="code"
            required
            maxLength={12}
            defaultValue={initial?.code}
            placeholder="e.g. CCS"
            className="uppercase"
          />
        </Field>
      </div>
      <Field label="Dean" htmlFor={initial ? `cd-${initial.code}` : "c-dean"} hint="Optional — assign an account with the Dean role.">
        <Select id={initial ? `cd-${initial.code}` : "c-dean"} name="deanId" defaultValue={initial?.deanId ?? ""}>
          <option value="">Not assigned</option>
          {deans.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
