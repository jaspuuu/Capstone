"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/lib/actions/auth";
import type { ChangePasswordState } from "@/lib/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function ChangePasswordForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction] = useActionState<ChangePasswordState, FormData>(changePassword, {});
  const router = useRouter();

  const done = Boolean(state.success);
  useEffect(() => {
    if (done && redirectTo) {
      router.replace(redirectTo);
    }
  }, [done, redirectTo, router]);

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && !redirectTo && <Alert tone="success">{state.success}</Alert>}

      <Field label="Current password" htmlFor="current" required>
        <Input id="current" name="current" type="password" required autoComplete="current-password" />
      </Field>
      <Field label="New password" htmlFor="next" required hint="Minimum 8 characters.">
        <Input id="next" name="next" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" required>
        <Input id="confirm" name="confirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
      </Field>

      <SubmitButton pendingLabel="Updating…">
        {redirectTo ? "Save and continue" : "Update password"}
      </SubmitButton>
    </form>
  );
}
