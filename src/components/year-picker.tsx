"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { setSelectedAy } from "@/lib/actions/ay";
import { cn } from "@/lib/utils";

/**
 * Academic-year switcher in the topbar (beside the bell). Picking a year
 * stores it in a cookie and refreshes the server tree so every document
 * list re-renders for that year.
 */
export function YearPicker({
  selectedAy,
  years,
}: {
  selectedAy: string;
  years: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(ay: string) {
    setOpen(false);
    if (ay === selectedAy) return;
    startTransition(async () => {
      await setSelectedAy(ay);
      router.refresh();
    });
  }

  const options = years.includes(selectedAy)
    ? years
    : [...years, selectedAy].sort();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Academic year: ${selectedAy}. Change academic year`}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-xs font-semibold text-content transition-colors hover:border-primary hover:bg-primary-light/50",
          pending && "opacity-60"
        )}
      >
        <CalendarDays className="size-4 text-content-secondary" aria-hidden />
        <span className="hidden sm:inline">AY {selectedAy}</span>
        <ChevronDown className="size-3.5 text-content-secondary" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Academic year"
          className="absolute top-11 right-0 w-44 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        >
          <p className="border-b border-line px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-content-muted">
            Academic year
          </p>
          {options.map((ay) => (
            <button
              key={ay}
              type="button"
              role="menuitemradio"
              aria-checked={ay === selectedAy}
              onClick={() => pick(ay)}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-surface-secondary",
                ay === selectedAy ? "text-primary" : "text-content"
              )}
            >
              AY {ay}
              {ay === selectedAy && <Check className="size-4" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
