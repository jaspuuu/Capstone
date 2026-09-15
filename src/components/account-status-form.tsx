"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { setUserAccountStatus } from "@/lib/actions/users";
import type { ActionState } from "@/lib/actions/users";
import { ACCOUNT_STATUS_META } from "@/lib/constants";
import type { AccountStatus } from "@/generated/prisma/client";

const LOCKED_STATUSES = ["SUSPENDED", "DEACTIVATED", "ARCHIVED"] as const;

/** Compact per-row control for the account lifecycle (§account model). */
export function AccountStatusForm({
  userId,
  email,
  current,
}: {
  userId: string;
  email: string;
  current: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(setUserAccountStatus, {});

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const next = String(new FormData(e.currentTarget).get("status") ?? "");
        const locks = (LOCKED_STATUSES as readonly string[]).includes(next);
        if (locks && next !== current) {
          if (
            !window.confirm(
              `Change ${email} to ${ACCOUNT_STATUS_META[next as AccountStatus].label.toLowerCase()}? Their active sessions will be signed out immediately.`
            )
          ) {
            e.preventDefault();
          }
        }
      }}
    >
      <input type="hidden" name="id" value={userId} />
      {state.error && <p className="mb-1 text-xs font-medium text-danger">{state.error}</p>}
      <div className="flex min-w-44 items-center gap-2">
        <select
          name="status"
          defaultValue={current}
          aria-label={`Status for ${email}`}
          className="h-8 w-32 rounded-lg border border-line-strong bg-surface px-2 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        >
          {(Object.entries(ACCOUNT_STATUS_META) as [AccountStatus, { label: string }][]).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
        <SubmitButton size="sm" variant="outline" pendingLabel="Updating…">
          Set
        </SubmitButton>
      </div>
    </form>
  );
}