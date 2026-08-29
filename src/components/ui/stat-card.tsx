import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ICON_TONES: Record<string, string> = {
  primary: "bg-primary-light text-primary",
  gold: "bg-gold-light text-gold-dark",
  success: "bg-success-light text-success",
  warning: "bg-warning-light text-warning",
  info: "bg-info-light text-info",
  danger: "bg-danger-light text-danger",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  iconTone = "primary",
  badge,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  iconTone?: keyof typeof ICON_TONES;
  badge?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
          {label}
        </p>
        {Icon && (
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              ICON_TONES[iconTone] ?? ICON_TONES.primary
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="font-display text-3xl font-bold tracking-tight tabular-nums text-content">{value}</p>
        {badge}
      </div>
      {hint && <p className="mt-1 text-xs text-content-muted">{hint}</p>}
    </>
  );

  const keyline =
    iconTone === "gold" ? "border-t-2 border-t-gold" : "border-t-2 border-t-primary";
  const classes = cn("overflow-hidden border-t-2 p-5", keyline, href && "transition-shadow hover:shadow-pop", className);

  if (href) {
    return (
      <Card className={classes}>
        <Link href={href} className="block rounded-lg focus-visible:outline-primary">
          {body}
        </Link>
      </Card>
    );
  }
  return <Card className={classes}>{body}</Card>;
}
