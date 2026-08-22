import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, Landmark, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const GOOGLE_ERRORS: Record<string, string> = {
  google_unconfigured:
    "Google sign-in is not configured yet. Use your email and password, or contact the OSAS administrator.",
  google_failed:
    "Google sign-in failed or was cancelled. Try again or sign in with your email and password.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  // Validated sign-in check: only redirect when the session is actually
  // alive (a stale cookie simply renders the form again).
  const user = await getSessionUser();
  if (user) {
    if (user.mustChangePassword) redirect("/change-password");
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    redirect(safeNext);
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary-dark p-10 text-white lg:flex">
        <div
          aria-hidden
          className="absolute -top-32 -right-32 size-96 rounded-full bg-primary opacity-60 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-40 -left-24 size-96 rounded-full bg-gold/15 blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-gold font-display text-base font-extrabold text-primary-dark">
            OR
          </span>
          <div>
            <p className="font-display text-lg font-bold tracking-tight">ORGanIZE</p>
            <p className="text-xs font-medium text-sidebar-text-muted">
              LSPU · Office of Student Affairs and Services
            </p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="font-display text-4xl leading-tight font-extrabold tracking-tight">
            One workspace for every student organization —{" "}
            <span className="text-gold">from recognition to renewal.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-text-secondary">
            Manage accreditation, activities, deadlines, monitoring and records for LSPU student
            organizations in a single connected system.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-sidebar-text-secondary">
            {[
              { icon: Landmark, text: "Organization profiles, hierarchy and adviser assignments" },
              { icon: ShieldCheck, text: "Role-based access for OSAS, SOA, deans, advisers and officers" },
              { icon: GraduationCap, text: "Recognition lifecycle with full historical records" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-4 text-gold" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-text-muted">
          Laguna State Polytechnic University · Student Organization Management System
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-surface px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary font-display text-sm font-extrabold text-white">
              OR
            </span>
            <div>
              <p className="font-display text-base font-bold text-content">ORGanIZE</p>
              <p className="text-xs text-content-secondary">LSPU · OSAS</p>
            </div>
          </div>

          <h2 className="font-display text-2xl font-bold tracking-tight text-content">
            Sign in to your account
          </h2>
          <p className="mt-1 mb-6 text-sm text-content-secondary">
            Use your institutional credentials to continue.
          </p>

          {error && GOOGLE_ERRORS[error] && (
            <Alert tone="danger" className="mb-4">
              {GOOGLE_ERRORS[error]}
            </Alert>
          )}

          <a
            href={`/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-surface text-sm font-semibold text-content shadow-sm transition-colors hover:border-primary hover:text-primary"
          >
            <GoogleIcon />
            Continue with Google
          </a>

          <div className="my-5 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs font-medium text-content-muted">or sign in with email</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <LoginForm next={next} />

          <p className="mt-8 border-t border-line pt-5 text-center text-sm text-content-secondary">
            New to ORGanIZE?{" "}
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
