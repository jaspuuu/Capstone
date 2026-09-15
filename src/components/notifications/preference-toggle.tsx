"use client";

import { useState, useTransition } from "react";
import { setNotificationPreference } from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";

/**
 * Toggle for one notification category. Mandatory categories render disabled
 * (they cannot be muted because they carry actions the user must perform).
 */
export function PreferenceToggle({
  category,
  enabled,
  locked,
}: {
  category: string;
  enabled: boolean;
  locked?: boolean;
}) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (locked || pending) return;
    const next = !on;
    setOn(next);
    startTransition(() => {
      setNotificationPreference({ category, enabled: next });
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={locked ? true : on}
      aria-disabled={locked || pending}
      disabled={locked || pending}
      onClick={toggle}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        locked ? "bg-primary/70" : on ? "bg-primary" : "bg-surface-secondary",
        pending && "opacity-60"
      )}
    >
      <span
        className={cn(
          "inline-block size-4.5 translate-x-1 rounded-full bg-white shadow transition-transform",
          (on || locked) && "translate-x-[1.4rem]"
        )}
      />
    </button>
  );
}