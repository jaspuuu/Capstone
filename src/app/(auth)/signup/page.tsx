import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  // Signed-in users don't need the registration form.
  const user = await getSessionUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary font-display text-sm font-extrabold text-white">
            OR
          </span>
          <div>
            <p className="font-display text-base font-bold text-content">ORGanIZE</p>
            <p className="text-xs text-content-secondary">LSPU · OSAS</p>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-content">
            Create your account
          </h1>
          <p className="mt-1 mb-6 text-sm text-content-secondary">
            Register as a student member. OSAS can later add you to an organization or grant
            additional roles.
          </p>

          <SignUpForm />
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-content-muted">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          Accounts created here start with member-level access only.
        </p>
      </div>
    </div>
  );
}
