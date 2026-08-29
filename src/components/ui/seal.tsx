import { cn } from "@/lib/utils";

/**
 * Institutional seal mark — the ORGanIZE brand emblem. A gold-ringed seal on
 * deep institutional blue, with the monogram and the two classic 4-point stars,
 * echoing the university crest vernacular. Decorative only (aria-hidden).
 */
export function Seal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0 font-display", className)} aria-hidden>
      <circle cx="32" cy="32" r="31" fill="#123b63" />
      <circle cx="32" cy="32" r="28" fill="none" stroke="#c9a227" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="24.25" fill="none" stroke="#c9a227" strokeOpacity="0.45" strokeWidth="0.75" />
      <path fill="#c9a227" d="M32 4.5l1.7 3.6 3.6 1.7-3.6 1.7-1.7 3.6-1.7-3.6-3.6-1.7 3.6-1.7z" />
      <path fill="#c9a227" d="M32 59.5l1.7-3.6 3.6-1.7-3.6-1.7-1.7-3.6-1.7 3.6-3.6 1.7 3.6 1.7z" />
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="17"
        fontWeight="800"
        letterSpacing="1"
        fill="#c9a227"
      >
        OR
      </text>
    </svg>
  );
}