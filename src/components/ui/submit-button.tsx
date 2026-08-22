"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { buttonClasses, type ButtonProps } from "@/components/ui/button";

type Variant = NonNullable<ButtonProps["variant"]>;

/**
 * Submit button bound to the pending state of the enclosing <form>.
 * Works with Server Action forms and degrades to a normal submit
 * when JavaScript has not loaded yet.
 */
export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  pendingLabel,
  ...rest
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || rest.disabled}
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      {pending ? (
        <>
          <Loader2 aria-hidden className="size-4 animate-spin" />
          {pendingLabel ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Compact icon-only confirm/cancel buttons for inline workflow actions. */
export function InlineSubmitButton({
  children,
  variant = "primary",
  name,
  value,
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  name?: string;
  value?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClasses(variant, "sm", className)}
    >
      {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : children}
    </button>
  );
}
