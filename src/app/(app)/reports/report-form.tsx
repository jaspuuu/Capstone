"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

type ActionState = { error?: string; success?: string };

export type ReportInitial = {
  id: string;
  organizationId: string;
  activityProposalId: string | null;
  title: string;
  narrative: string;
  heldOn: Date;
  actualParticipants: number | null;
  actualBudget: number | null;
};

function toLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function ReportForm({
  action,
  organizations,
  proposals,
  initial,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  organizations: { id: string; label: string }[];
  proposals: { id: string; label: string; organizationId: string }[];
  initial?: ReportInitial;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Organization" htmlFor="organizationId" required>
        <Select id="organizationId" name="organizationId" required defaultValue={initial?.organizationId} disabled={Boolean(initial)}>
          {!initial && <option value="">Select an organization…</option>}
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        {initial && (
          <input type="hidden" name="organizationId" value={initial.organizationId} />
        )}
      </Field>

      <Field
        label="Linked activity proposal"
        htmlFor="activityProposalId"
        hint="Optional — link an approved proposal to document it. Accepting the report marks the activity completed."
      >
        <Select id="activityProposalId" name="activityProposalId" defaultValue={initial?.activityProposalId ?? ""}>
          <option value="">None (unplanned activity)</option>
          {proposals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Report title" htmlFor="title" required>
        <Input id="title" name="title" required maxLength={200} defaultValue={initial?.title} />
      </Field>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Field label="Date held" htmlFor="heldOn" required>
          <Input
            id="heldOn"
            name="heldOn"
            type="date"
            required
            defaultValue={initial ? toLocalDate(initial.heldOn) : ""}
          />
        </Field>
        <Field label="Actual participants" htmlFor="actualParticipants">
          <Input
            id="actualParticipants"
            name="actualParticipants"
            type="number"
            min="0"
            step="1"
            defaultValue={initial?.actualParticipants ?? ""}
          />
        </Field>
        <Field label="Actual expenses (₱)" htmlFor="actualBudget">
          <Input
            id="actualBudget"
            name="actualBudget"
            type="number"
            min="0"
            step="0.01"
            defaultValue={initial?.actualBudget ?? ""}
          />
        </Field>
      </div>

      <Field
        label="Narrative report"
        htmlFor="narrative"
        required
        hint="What happened, outcomes, attendance highlights, and supporting documentation submitted to the office."
      >
        <Textarea id="narrative" name="narrative" rows={6} required maxLength={8000} defaultValue={initial?.narrative} />
      </Field>

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
