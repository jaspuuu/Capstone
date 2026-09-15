"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { FORM_DRAFT_FIELDS, type FormDraftData } from "@/lib/form-draft-data";
import { saveFormDraft, type FormDraftActionState } from "@/lib/actions/form-draft";

const EMPTY: FormDraftActionState = {};

/**
 * Edit inspector for the official form. The official document stays fully
 * visible on the left; this panel lists ONLY the legitimate variable fields.
 * Values are stored as overrides (FormDocument.data) — the DOCX template never
 * changes. Saving persists the draft without starting the workflow.
 */
export function FormFieldsEditor({
  formKey,
  organizationId,
  academicYear,
  initial,
  activeField,
  onActiveField,
  onDirtyChange,
}: {
  formKey: string;
  organizationId: string;
  academicYear: string;
  initial: FormDraftData;
  activeField?: string | null;
  onActiveField?: (key: string | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [values, setValues] = useState<FormDraftData>(initial);
  const [state, action] = useActionState(saveFormDraft, EMPTY);
  const router = useRouter();
  const lastReported = useRef<boolean | null>(null);

  // A saved draft bumps FormDocument.version, so the page's pdfHref/docxHref
  // (which carry `&v=<version>`) must be re-fetched or the rendered PDF stays
  // stale. Refresh the server props the same way Submit does.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  // Surface unsaved-edit state so the workspace can guard navigation.
  useEffect(() => {
    const dirty =
      FORM_DRAFT_FIELDS.some(
        ({ key }) => (values[key] ?? "") !== (initial[key] ?? "")
      ) || false;
    if (dirty === lastReported.current && lastReported.current !== null) return;
    lastReported.current = dirty;
    onDirtyChange?.(dirty);
  }, [values, initial, onDirtyChange]);

  const set = (key: keyof FormDraftData, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value === "" ? undefined : value }));

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="formKey" value={formKey} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="academicYear" value={academicYear} />
      {FORM_DRAFT_FIELDS.map(({ key, label }) => {
        const active = activeField === key;
        return (
          <label
            key={key}
            onMouseEnter={() => onActiveField?.(key)}
            onMouseLeave={() => {
              if (activeField === key) onActiveField?.(null);
            }}
            className={`block rounded-lg border px-3 py-2 transition-colors ${
              active ? "border-blue-400 bg-blue-50" : "border-transparent"
            }`}
          >
            <span
              className={`flex items-center justify-between gap-1 text-xs font-semibold ${
                active ? "text-blue-800" : "text-content-secondary"
              }`}
            >
              {label}
              {active && (
                <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">
                  Located
                </span>
              )}
            </span>
            <input
              type="text"
              name={key}
              value={values[key] ?? ""}
              onFocus={() => onActiveField?.(key)}
              onChange={(e) => set(key, e.target.value)}
              className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        );
      })}

      <p className="text-[11px] leading-snug text-content-muted">
        Values are stored as overrides and merged into the official document at export time. The
        institutional DOCX template is never modified.
      </p>

      {(state.error || state.ok) && (
        <p
          role="alert"
          className={`rounded-lg px-3 py-2 text-xs ${
            state.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {state.error ?? state.ok}
        </p>
      )}

      <button
        type="submit"
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
      >
        <Save className="size-3.5" aria-hidden />
        Save Draft
      </button>
    </form>
  );
}