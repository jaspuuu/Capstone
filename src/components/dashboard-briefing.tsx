import { Seal } from "@/components/ui/seal";

/**
 * Letterhead briefing plate for the dashboard: a deep-ink panel with the
 * institutional seal ghosted into the corner and a gilt rule at the foot —
 * the "bound register" opening page. Decorative elements are aria-hidden.
 */
export function DashboardBriefing({
  title,
  description,
  rubric,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  rubric?: string;
}) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-primary-dark/40 bg-gradient-to-br from-primary-dark via-primary to-primary-hover px-6 py-6 shadow-raised sm:px-8">
      <Seal className="absolute -top-12 -right-10 size-48 rotate-12 opacity-10" />
      {rubric && (
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">{rubric}</p>
      )}
      <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-white">{title}</h1>
      {description && (
        <p className="mt-1.5 max-w-2xl text-sm text-pretty text-white/70">{description}</p>
      )}
      <span
        aria-hidden
        className="absolute right-6 bottom-0 left-6 h-px bg-gradient-to-r from-gold/70 via-gold/25 to-transparent"
      />
    </div>
  );
}