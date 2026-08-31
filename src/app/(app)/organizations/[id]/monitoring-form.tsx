"use client";

import { useActionState, useState } from "react";
import type { MonitoringStatus } from "@/generated/prisma/client";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { MONITORING_STATUS_META } from "@/lib/constants";
import { saveMonitoring, type ActionState } from "@/lib/actions/monitoring";

type PersonOption = { userId: string; name: string };

function toLocalDate(d: Date | null | undefined): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function MonitoringForm({
  activityId,
  activityTitle,
  initialStatus = "NOT_IMPLEMENTED",
  initialReason,
  initialRescheduledTo,
  initialResponsibleNote,
  initialResponsibleIds = [],
  officers,
  members,
  advisers,
}: {
  activityId: string;
  activityTitle: string;
  initialStatus?: MonitoringStatus;
  initialReason?: string | null;
  initialRescheduledTo?: Date | null;
  initialResponsibleNote?: string | null;
  initialResponsibleIds?: string[];
  officers: PersonOption[];
  members: PersonOption[];
  advisers: PersonOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveMonitoring,
    {}
  );
  const [status, setStatus] = useState<MonitoringStatus>(initialStatus);
  const [responsibleIds, setResponsibleIds] = useState<string[]>(initialResponsibleIds);

  const showReason = status === "NOT_IMPLEMENTED" || status === "RESCHEDULED";
  const showReschedule = status === "RESCHEDULED";

  function toggle(id: string) {
    setResponsibleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <input type="hidden" name="activityId" value={activityId} />
      <p className="sr-only">{activityTitle}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Monitoring outcome" htmlFor={`status-${activityId}`} required>
          <Select
            id={`status-${activityId}`}
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as MonitoringStatus)}
          >
            {(["IMPLEMENTED", "NOT_IMPLEMENTED", "RESCHEDULED"] as const).map((s) => (
              <option key={s} value={s}>
                {MONITORING_STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>
        {showReschedule && (
          <Field
            label="New target date"
            htmlFor={`rescheduledTo-${activityId}`}
            required
            hint="The original date is kept; this is the new target."
          >
            <Input
              id={`rescheduledTo-${activityId}`}
              name="rescheduledTo"
              type="date"
              required
              defaultValue={toLocalDate(initialRescheduledTo) || undefined}
            />
          </Field>
        )}
      </div>

      {showReason && (
        <Field
          label={status === "RESCHEDULED" ? "Reason for rescheduling" : "Reason not implemented"}
          htmlFor={`reason-${activityId}`}
          required
        >
          <Textarea
            id={`reason-${activityId}`}
            name="reason"
            rows={2}
            maxLength={1000}
            required
            defaultValue={initialReason ?? ""}
          />
        </Field>
      )}

      <Field label="Responsible note (optional)" htmlFor={`note-${activityId}`}>
        <Input
          id={`note-${activityId}`}
          name="responsibleNote"
          maxLength={500}
          placeholder="e.g. monitored by the organization secretary"
          defaultValue={initialResponsibleNote ?? ""}
        />
      </Field>

      {(officers.length > 0 || members.length > 0 || advisers.length > 0) && (
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-xs font-semibold text-content-secondary">
            Responsible people
          </legend>
          {[{ label: "Officers", list: officers }, { label: "Members", list: members }, { label: "Advisers", list: advisers }]
            .filter((g) => g.list.length > 0)
            .map((group) => (
              <div key={group.label} className="mb-2 last:mb-0">
                <p className="mb-1 text-[11px] font-bold tracking-wide text-content-muted uppercase">{group.label}</p>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {group.list.map((p) => (
                    <li key={p.userId}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="responsibleMemberIds"
                          value={p.userId}
                          checked={responsibleIds.includes(p.userId)}
                          onChange={() => toggle(p.userId)}
                          className="size-4 rounded border-line-strong text-primary focus:ring-primary/25"
                        />
                        <span className="text-content">{p.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </fieldset>
      )}

      <SubmitButton pendingLabel="Saving…" size="sm">
        Save outcome
      </SubmitButton>
    </form>
  );
}