import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { logout } from "@/lib/actions/auth";
import { fullName } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ChangePasswordForm } from "@/app/(app)/profile/change-password-form";
export const instant = false;

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-secondary px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary font-display text-lg font-extrabold text-white shadow-card">
            OR
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight text-content">
            Set your own password
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            {fullName(user)} · {user.email}
          </p>
        </div>

        <Card>
          <CardHeader
            icon={KeyRound}
            title="Your account uses a temporary password"
            description="Choose a new password to continue. You will not be able to access the system until it is changed."
          />
          <CardContent>
            <ChangePasswordForm redirectTo="/dashboard" />
            <form action={logout} className="mt-4 border-t border-line pt-4">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-content-secondary hover:text-danger"
              >
                <LogOut className="size-3.5" aria-hidden />
                Sign out instead
              </button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-content-muted">
          <Link href="/login" className="hover:text-content-secondary">
            ORGanIZE · LSPU-OSAS
          </Link>
        </p>
      </div>
    </div>
  );
}
