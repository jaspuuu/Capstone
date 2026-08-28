"use client";

import { useActionState } from "react";
import {
  EVALUATION_DIMENSIONS,
  saveEvaluation,
  type EvaluationState,
} from "@/lib/actions/evaluations";

const EMPTY: EvaluationState = {};

type EvalField = {
  key: "relevance" | "impact" | "efficiency" | "sustainability";
  label: string;
  help: string;
};

type ExistingEval = Record<EvalField["key"], number> & { remarks: string | null };

export function EvaluationForm({
  activityId,
  existing,
}: {
  activityId: string;
  existing: ExistingEval | null;
}) {
  const [state, action] = useActionState(saveEvaluation, EMPTY);
  const dims = EVALUATION_DIMENSIONS as readonly EvalField[];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="activityId" value={activityId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {dims.map((d) => (
          <label key={d.key} className="block">
            <span className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-content">{d.label}</span>
              <span className="text-[11px] text-content-secondary">1 = poor · 5 = excellent</span>
            </span>
            <input
              type="number"
              name={d.key}
              min={1}
              max={5}
              step={1}
              required
              defaultValue={existing?.[d.key] ?? 3}
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
            <span className="mt-0.5 block text-[11px] text-content-muted">{d.help}</span>
          </label>
        ))}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-content-secondary">Remarks</span>
        <textarea
          name="remarks"
          rows={2}
          maxLength={2000}
          defaultValue={existing?.remarks ?? ""}
          placeholder="Optional note for the M&E record…"
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </label>
      <p className="text-xs text-content-secondary">
        The evaluation is stored explicitly and feeds the Monitoring & Evaluation panel — the system never guesses ratings.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          {existing ? "Update evaluation" : "Save evaluation"}
        </button>
        {(state.ok || state.error) && (
          <p
            className={`text-xs font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}
            role="alert"
          >
            {state.ok ?? state.error}
          </p>
        )}
      </div>
    </form>
  );
}