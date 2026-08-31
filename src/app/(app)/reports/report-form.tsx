"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ParticipantOption } from "@/lib/organization-participants";

type ActionState = { error?: string; success?: string };

export type ReportInitial = {
  id: string;
  organizationId: string;
  activityProposalId: string | null;
  title: string;
  narrative: string;
  heldOn: Date;
  duration?: string | null;
  location?: string | null;
  conductedBy?: string | null;
  actualParticipants: number | null;
  actualBudget: number | null;
  budgetRemarks?: string | null;
  expectedParticipants?: number | null;
};

function toLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function ReportForm({
  action,
  organizations,
  proposals,
  orgMembers,
  initial,
  initialParticipantIds = [],
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  organizations: { id: string; label: string }[];
  proposals: { id: string; label: string; organizationId: string }[];
  orgMembers: Record<string, ParticipantOption[]>;
  initial?: ReportInitial;
  initialParticipantIds?: string[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [selOrg, setSelOrg] = useState<string>(initial?.organizationId ?? "");
  const roster = orgMembers[selOrg] ?? [];
  const [participantIds, setParticipantIds] = useState<string[]>(
    initial
      ? initialParticipantIds.filter((id) => roster.some((m) => m.userId === id))
      : []
  );
  const [count, setCount] = useState<string>(
    initial?.actualParticipants != null ? String(initial.actualParticipants) : ""
  );
  const expected = initial?.expectedParticipants ?? null;
  const belowExpected =
    expected != null &&
    count.trim() !== "" &&
    !Number.isNaN(Number(count)) &&
    Number(count) < expected;

  function applySelection(next: Set<string>) {
    setParticipantIds([...next]);
    setCount(String(next.size));
  }

  function toggleMember(userId: string) {
    const next = new Set(participantIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    applySelection(next);
  }

  function changeOrg(orgId: string) {
    setSelOrg(orgId);
    setParticipantIds([]);
    setCount("");
  }

  return (
    <form action={formAction} className="space-y-5">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Organization" htmlFor="organizationId" required>
        <Select
          id="organizationId"
          name="organizationId"
          required
          value={selOrg}
          disabled={Boolean(initial)}
          onChange={(e) => changeOrg(e.target.value)}
        >
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
        hint="Optional — link an approved proposal whose monitoring outcome is marked Implemented. Accepting the report marks the activity completed."
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
        <Field label="Duration" htmlFor="duration">
          <Input id="duration" name="duration" maxLength={100} placeholder="e.g. 4 hours" defaultValue={initial?.duration ?? ""} />
        </Field>
        <Field label="Venue / location" htmlFor="location">
          <Input id="location" name="location" maxLength={200} defaultValue={initial?.location ?? ""} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Conducted / sponsored by" htmlFor="conductedBy">
          <Input id="conductedBy" name="conductedBy" maxLength={200} defaultValue={initial?.conductedBy ?? ""} />
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

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-content">Participants</legend>
        <p className="mb-3 text-xs text-content-secondary">
          Select who took part from the organization&apos;s current roster (officers first). The actual
          participant count syncs to the people selected.
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-content-secondary">Presets:</span>
          <button
            type="button"
            onClick={() => applySelection(new Set(roster.map((m) => m.userId)))}
            className="rounded-md border border-line-strong px-2.5 py-1 text-xs font-semibold text-content hover:border-primary hover:text-primary"
          >
            Select all members
          </button>
          <button
            type="button"
            onClick={() => applySelection(new Set(roster.filter((m) => m.isOfficer).map((m) => m.userId)))}
            className="rounded-md border border-line-strong px-2.5 py-1 text-xs font-semibold text-content hover:border-primary hover:text-primary"
          >
            Officers only
          </button>
          <button
            type="button"
            onClick={() => applySelection(new Set())}
            className="rounded-md border border-line-strong px-2.5 py-1 text-xs font-semibold text-content-secondary hover:border-danger hover:text-danger"
          >
            Clear
          </button>
          <span className="ml-auto text-xs font-medium text-content-secondary" aria-live="polite">
            {participantIds.length} selected
          </span>
        </div>

        {roster.length === 0 ? (
          <p className="text-xs text-content-muted">
            No current members on record yet — you can still file the report and enter participants by count.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2">
            {roster.map((m) => (
              <li key={m.userId}>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    name="participantIds"
                    value={m.userId}
                    checked={participantIds.includes(m.userId)}
                    onChange={() => toggleMember(m.userId)}
                    className="size-4 rounded border-line-strong text-primary focus:ring-primary/25"
                  />
                  <span className="text-content">{m.name}</span>
                  {m.positionLabel && (
                    <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-[11px] font-medium text-content-secondary">
                      {m.positionLabel}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field
          label="Actual participants (count)"
          htmlFor="actualParticipants"
          hint={`Synced to the ${participantIds.length} people selected above — adjust manually if needed.`}
        >
          <Input
            id="actualParticipants"
            name="actualParticipants"
            type="number"
            min="0"
            step="1"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
          {belowExpected && (
            <p className="mt-1 text-xs font-medium text-red-600">
              Below the planned {expected} participants — confirm this in the narrative.
            </p>
          )}
        </Field>
        <Field label="Budget remarks (optional)" htmlFor="budgetRemarks">
          <Textarea id="budgetRemarks" name="budgetRemarks" rows={2} maxLength={1000} defaultValue={initial?.budgetRemarks ?? ""} />
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