"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/actions/deadlines";

function toLocalInput(d: Date | string | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function DeadlineForm({
  action,
  colleges,
  initial,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  colleges: { id: string; label: string }[];
  initial?: {
    id: string;
    name: string;
    process: string;
    academicYear: string;
    startDate: Date | string;
    dueDate: Date | string;
    scopeType: string;
    scopeCollegeId: string | null;
    instructions: string | null;
  };
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [scopeType, setScopeType] = useState(initial?.scopeType ?? "ALL");

  return (
    <form action={formAction} className="space-y-5">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Deadline name" htmlFor="name" required>
        <Input
          id="name"
          name="name"
          required
          maxLength={160}
          defaultValue={initial?.name}
          placeholder="e.g. Recognition Application Deadline"
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Process" htmlFor="process" required>
          <Select id="process" name="process" required defaultValue={initial?.process ?? "RECOGNITION"}>
            <option value="RECOGNITION">Recognition Application</option>
            <option value="RENEWAL">Recognition Renewal</option>
            <option value="ACTIVITY">Activity Proposal</option>
            <option value="ACCOMPLISHMENT">Accomplishment Report</option>
            <option value="OTHER">Other Submission</option>
          </Select>
        </Field>

        <Field label="Academic year" htmlFor="academicYear" required>
          <Input
            id="academicYear"
            name="academicYear"
            required
            pattern="\d{4}-\d{4}"
            defaultValue={initial?.academicYear}
            placeholder="2026-2027"
          />
        </Field>

        <Field label="Start date & time" htmlFor="startDate" required>
          <Input
            id="startDate"
            name="startDate"
            type="datetime-local"
            required
            defaultValue={toLocalInput(initial?.startDate)}
          />
        </Field>

        <Field label="Deadline date & time" htmlFor="dueDate" required>
          <Input
            id="dueDate"
            name="dueDate"
            type="datetime-local"
            required
            defaultValue={toLocalInput(initial?.dueDate)}
          />
        </Field>

        <Field label="Applies to" htmlFor="scopeType" required>
          <Select
            id="scopeType"
            name="scopeType"
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value)}
            required
          >
            <option value="ALL">All organizations</option>
            <option value="MOTHER">Mother organizations only</option>
            <option value="CHILD">Sub-organizations only</option>
            <option value="INDEPENDENT">Independent organizations only</option>
          </Select>
        </Field>

        <Field label="Limit to college" htmlFor="scopeCollegeId" hint="Optional — leave empty for the whole university">
          <Select id="scopeCollegeId" name="scopeCollegeId" defaultValue={initial?.scopeCollegeId ?? ""}>
            <option value="">All colleges</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Instructions" htmlFor="instructions" hint="Shown to organizations alongside the deadline.">
        <Textarea id="instructions" name="instructions" maxLength={2000} defaultValue={initial?.instructions ?? ""} />
      </Field>

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
