"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { signUp, type SignUpState } from "@/lib/actions/auth";

export function SignUpForm() {
  const [state, action] = useActionState<SignUpState, FormData>(signUp, {});

  return (
    <form action={action} className="space-y-4" noValidate={false}>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" required>
          <Input id="firstName" name="firstName" autoComplete="given-name" required autoFocus />
        </Field>
        <Field label="Last name" htmlFor="lastName" required>
          <Input id="lastName" name="lastName" autoComplete="family-name" required />
        </Field>
      </div>
      <Field label="Middle name (optional)" htmlFor="middleName">
        <Input id="middleName" name="middleName" autoComplete="additional-name" />
      </Field>
      <Field label="Email" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@lspu.edu.ph"
          required
        />
      </Field>
      <Field label="Password" htmlFor="password" required hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" required>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating account…">
        Create account
      </SubmitButton>
      <p className="text-center text-xs text-content-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
