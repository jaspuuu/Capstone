import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "dark" | "gold" | "outline" | "ghost" | "danger" | "sidebar";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover focus-visible:outline-primary shadow-sm",
  dark: "bg-primary-dark text-white hover:bg-primary focus-visible:outline-primary-dark shadow-sm",
  gold: "bg-gold text-primary-dark hover:bg-gold-dark hover:text-white shadow-sm font-semibold",
  outline:
    "border border-line-strong bg-surface text-content hover:bg-surface-secondary hover:border-primary",
  ghost: "text-primary hover:bg-primary-light",
  danger: "bg-danger text-white hover:bg-danger/90 shadow-sm",
  sidebar: "bg-white/10 text-sidebar-text hover:bg-white/20 border border-white/20",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2 rounded-lg",
};

export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
  className?: string
) {
  return cn(
    "inline-flex items-center justify-center font-semibold transition-colors select-none whitespace-nowrap",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  );
});

export type { Variant as ButtonVariant, Size as ButtonSize };
