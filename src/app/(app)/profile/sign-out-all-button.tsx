"use client";

import { useTransition } from "react";
import { revokeAllSessions } from "@/lib/actions/auth";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Sign out all devices": revokes every session for the account (including
 * this one) after a confirmation, then lands the user back on the login page.
 */
export function SignOutAllButton() {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    if (!window.confirm("Sign out of every device, including this one?")) return;
    startTransition(() => revokeAllSessions());
  };

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={handleClick}>
      <LogOut className="size-4" />
      {pending ? "Signing out\u2026" : "Sign out all devices"}
    </Button>
  );
}