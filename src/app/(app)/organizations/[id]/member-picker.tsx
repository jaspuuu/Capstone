"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CheckSquare, Search, Square, UserPlus } from "lucide-react";
import { addMembersBulk, searchStudents, type ActionState } from "@/lib/actions/organizations";

// ---------------------------------------------------------------------------
// Member picker (§13-§14): search the existing student database, tick the
// students to register, and bulk-add them as APPROVED members. No retyping
// of names or student numbers — SF-005 reads the membership records.
// ---------------------------------------------------------------------------

type Student = {
  id: string;
  name: string;
  studentNumber: string | null;
  department: string | null;
};

const EMPTY: ActionState = {};

export function MemberPicker({
  organizationId,
  academicYear,
}: {
  organizationId: string;
  academicYear: string;
}) {
  const [state, formAction] = useActionState(addMembersBulk, EMPTY);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Map<string, Student>>(new Map());
  const [pending, startTransition] = useTransition();
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          const rows = await searchStudents({ organizationId, academicYear, q });
          setResults(rows);
          setSearched(true);
        } catch {
          setResults([]);
        }
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q, organizationId, academicYear]);

  function toggle(s: Student) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(s.id)) next.delete(s.id);
      else next.set(s.id, s);
      return next;
    });
  }

  const allVisibleSelected = results.length > 0 && results.every((s) => selected.has(s.id));

  if (state.success) {
    return (
      <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
        {state.success} The roster above and the SF-005 member list now include them.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="academicYear" value={academicYear} />

      <div>
        <label htmlFor="member-search" className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-content-secondary">
          <Search className="size-3.5" aria-hidden />
          Select members — search students by name, number, or email
        </label>
        <input
          id="member-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Mendoza or 2023-…"
          className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
        {!searched && !pending && (
          <p className="px-3 py-4 text-sm text-content-muted">Start typing to search the student directory.</p>
        )}
        {searched && results.length === 0 && !pending && (
          <p className="px-3 py-4 text-sm text-content-muted">No matching active students found.</p>
        )}
        {results.map((s) => {
          const checked = selected.has(s.id);
          return (
            <label
              key={s.id}
              className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-primary-light/30"
            >
              <input type="checkbox" name="userIds" value={s.id} className="sr-only" checked={checked} onChange={() => toggle(s)} />
              {checked ? (
                <CheckSquare className="size-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <Square className="size-4 shrink-0 text-content-muted" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-content">{s.name}</span>
                <span className="block truncate text-xs text-content-secondary">
                  {[s.studentNumber, s.department].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {results.length > 0 && (
        <button
          type="button"
          onClick={() =>
            setSelected((prev) => {
              const next = new Map(prev);
              if (allVisibleSelected) {
                for (const s of results) next.delete(s.id);
              } else {
                for (const s of results) next.set(s.id, s);
              }
              return next;
            })
          }
          className="text-xs font-semibold text-primary hover:underline"
        >
          {allVisibleSelected ? "Clear visible selections" : "Select all shown"}
        </button>
      )}

      {(state.error || state.success) && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
          role="alert"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={selected.size === 0}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
      >
        <UserPlus className="size-3.5" aria-hidden />
        Add {selected.size || ""} selected member{selected.size === 1 ? "" : "s"}
      </button>
    </form>
  );
}
