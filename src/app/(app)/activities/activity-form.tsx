"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

type ActionState = { error?: string; success?: string };

export type ActivityInitial = {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  objectives: string | null;
  venue: string | null;
  startAt: Date;
  endAt: Date;
  scope: string;
  estimatedBudget: number | null;
  expectedParticipants: number | null;
};

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ActivityForm({
  action,
  organizations,
  initial,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  organizations: { id: string; label: string }[];
  initial?: ActivityInitial;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [startAt, setStartAt] = useState(initial ? toLocalInput(initial.startAt) : "");
  const [endAt, setEndAt] = useState(initial ? toLocalInput(initial.endAt) : "");

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

      <Field label="Activity title" htmlFor="title" required>
        <Input id="title" name="title" required maxLength={200} defaultValue={initial?.title} placeholder="e.g. General Assembly and Team Building" />
      </Field>

      <Field
        label="Description"
        htmlFor="description"
        required
        hint="Brief program, target audience, and how the activity supports the organization's plans."
      >
        <Textarea id="description" name="description" rows={5} required maxLength={4000} defaultValue={initial?.description} />
      </Field>

      <Field
        label="Objectives"
        htmlFor="objectives"
        hint="What the activity aims to achieve, stated as measurable outcomes."
      >
        <Textarea id="objectives" name="objectives" rows={3} maxLength={4000} defaultValue={initial?.objectives ?? ""} />
      </Field>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Starts" htmlFor="startAt" required>
          <Input
            id="startAt"
            name="startAt"
            type="datetime-local"
            required
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
          />
        </Field>
        <Field label="Ends" htmlFor="endAt" required>
          <Input
            id="endAt"
            name="endAt"
            type="datetime-local"
            required
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Field label="Venue" htmlFor="venue">
          <Input id="venue" name="venue" maxLength={200} defaultValue={initial?.venue ?? ""} placeholder="e.g. CCS Lecture Hall" />
        </Field>
        <Field label="Estimated budget (₱)" htmlFor="estimatedBudget">
          <Input
            id="estimatedBudget"
            name="estimatedBudget"
            type="number"
            min="0"
            step="0.01"
            defaultValue={initial?.estimatedBudget ?? ""}
          />
        </Field>
        <Field label="Expected participants" htmlFor="expectedParticipants">
          <Input
            id="expectedParticipants"
            name="expectedParticipants"
            type="number"
            min="1"
            step="1"
            defaultValue={initial?.expectedParticipants ?? ""}
          />
        </Field>
      </div>

      <Field
        label="Scope"
        htmlFor="scope"
        required
        hint="University-wide activities are approved by OSAS; college-wide by the dean."
      >
        <Select id="scope" name="scope" required defaultValue={initial?.scope ?? "ORGANIZATION"}>
          <option value="ORGANIZATION">Organization-wide</option>
          <option value="COLLEGE">College-wide</option>
          <option value="UNIVERSITY">University-wide</option>
        </Select>
      </Field>

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
