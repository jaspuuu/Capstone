"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/actions/recognition";

export function RecognitionForm({
  action,
  organizations,
  initialOrgId,
  initialKind,
  suggestedYear,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  organizations: { id: string; label: string; hasCurrentApplication: boolean }[];
  initialOrgId?: string;
  initialKind: "INITIAL" | "RENEWAL";
  suggestedYear: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [kind, setKind] = useState(initialKind);
  const [orgId, setOrgId] = useState(initialOrgId ?? "");

  const selected = organizations.find((o) => o.id === orgId);

  return (
    <form action={formAction} className="space-y-5">
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field
        label="Organization"
        htmlFor="organizationId"
        required
        hint={selected?.hasCurrentApplication ? "This organization already has an application for the selected year." : undefined}
      >
        <Select
          id="organizationId"
          name="organizationId"
          required
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
        >
          <option value="" disabled>
            Select organization…
          </option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Application type" htmlFor="kind" required>
          <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "INITIAL" | "RENEWAL")}>
            <option value="INITIAL">Initial recognition</option>
            <option value="RENEWAL">Renewal of recognition</option>
          </Select>
        </Field>

        <Field
          label="Academic year"
          htmlFor="academicYear"
          required
          hint={kind === "RENEWAL" ? "The period being renewed into." : "The period to be recognized."}
        >
          <Input
            id="academicYear"
            name="academicYear"
            required
            pattern="\d{4}-\d{4}"
            defaultValue={suggestedYear}
            placeholder="2026-2027"
          />
        </Field>
      </div>

      <Field label="Notes to the reviewing office" htmlFor="remarks" hint="Optional">
        <Textarea
          id="remarks"
          name="remarks"
          maxLength={1000}
          placeholder="Anything the reviewers should know about this submission."
        />
      </Field>

      {kind === "RENEWAL" && (
        <Alert tone="info" title="Renewal keeps existing records">
          Renewal reuses the organization&apos;s existing profile and history — only the new period and
          updated requirements are processed.
        </Alert>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <SubmitButton pendingLabel="Creating…">Create application</SubmitButton>
        <p className="text-xs text-content-muted">
          The application is saved as a draft — you can review it before submitting.
        </p>
      </div>
    </form>
  );
}
