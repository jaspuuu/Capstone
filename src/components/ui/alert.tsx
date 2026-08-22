import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, { box: string; icon: React.ComponentType<{ className?: string }> }> = {
  info: { box: "bg-info-light border-info/20 text-info", icon: Info },
  success: { box: "bg-success-light border-success/20 text-success", icon: CheckCircle2 },
  warning: { box: "bg-warning-light border-warning/25 text-warning", icon: AlertTriangle },
  danger: { box: "bg-danger-light border-danger/20 text-danger", icon: XCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = TONES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-3.5 py-3 text-sm", box, className)}>
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn(title && "mt-0.5", "text-[13px] opacity-90")}>{children}</div>}
        </div>
      </div>
    </div>
  );
}
