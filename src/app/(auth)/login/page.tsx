import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCap, Landmark, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const DEMO_ACCOUNTS = [
  { role: "OSAS Administrator", email: "osas@lspu.edu.ph" },
  { role: "SOA Administrator", email: "soa@lspu.edu.ph" },
  { role: "College Dean", email: "dean.ccs@lspu.edu.ph" },
  { role: "Regular Faculty Adviser", email: "adviser.regular@lspu.edu.ph" },
  { role: "Part-Time Faculty Adviser", email: "adviser.parttime@lspu.edu.ph" },
  { role: "Organization President", email: "president.acs@lspu.edu.ph" },
  { role: "Organization Secretary", email: "secretary.jpia@lspu.edu.ph" },
  { role: "Organization Member", email: "member1.acs@lspu.edu.ph" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

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

          <LoginForm next={next} />

          <details className="group mt-8 rounded-xl border border-line bg-background open:bg-surface">
            <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-content-secondary transition-colors hover:text-primary">
              Demo accounts (seeded data)
              <span className="float-right group-open:hidden">+</span>
              <span className="float-right hidden group-open:inline">−</span>
            </summary>
            <div className="border-t border-line px-4 py-3">
              <p className="mb-2 text-[11px] text-content-muted">
                Password for all seeded accounts:{" "}
                <code className="rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-content">
                  Password123!
                </code>
              </p>
              <ul className="space-y-1.5">
                {DEMO_ACCOUNTS.map((a) => (
                  <li key={a.email} className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                    <span className="font-medium text-content">{a.role}</span>
                    <code className="text-content-secondary">{a.email}</code>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
