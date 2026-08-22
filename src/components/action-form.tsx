"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/actions/organizations";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Generic client wrapper for a server action form: renders fields, surfaces
 * the action's error/success message, and shows pending state.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  footerClassName = "mt-4",
}: {
  action: ServerAction;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "dark" | "gold" | "outline" | "ghost" | "danger" | "sidebar";
  size?: "sm" | "md" | "lg";
  className?: string;
  footerClassName?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className={className}>
      {state.error && (
        <Alert tone="danger" className="mb-3">
          {state.error}
        </Alert>
      )}
      {children}
      <div className={footerClassName}>
        <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

/** One-off confirmation button posting to a void server action. */
export function QuickActionForm({
  action,
  hidden,
  label,
  children,
  confirmMessage,
  variant = "outline",
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  hidden: Record<string, string>;
  label?: string;
  children?: React.ReactNode;
  confirmMessage?: string;
  variant?: "primary" | "dark" | "gold" | "outline" | "ghost" | "danger" | "sidebar";
  className?: string;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size="sm">
        {children ?? label}
      </SubmitButton>
    </form>
  );
}
