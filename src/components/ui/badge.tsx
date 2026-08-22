import {
  Award,
  CheckCircle2,
  CircleDashed,
  Clock,
  Eye,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/constants";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-success-light text-success border-success/20",
  warning: "bg-warning-light text-warning border-warning/25",
  info: "bg-info-light text-info border-info/20",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  danger: "bg-danger-light text-danger border-danger/20",
  neutral: "bg-surface-secondary text-content-secondary border-line-strong",
  gold: "bg-gold-light text-gold-dark border-gold/30",
  primary: "bg-primary-light text-primary border-primary/15",
};

const TONE_ICONS: Record<BadgeTone, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  warning: Clock,
  info: Eye,
  orange: RotateCcw,
  danger: XCircle,
  neutral: CircleDashed,
  gold: Award,
  primary: CheckCircle2,
};

/**
 * Status badge. Every tone pairs a distinct icon with the label so status
 * never depends on color alone (§38, §40).
 */
export function Badge({
  tone = "neutral",
  icon = true,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = TONE_ICONS[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
    >
      {icon && <Icon className="size-3 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

/** Small neutral chip for non-status metadata (counts, codes, tags). */
export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-surface-secondary border border-line px-2 py-0.5 text-xs font-medium text-content-secondary",
        className
      )}
    >
      {children}
    </span>
  );
}
