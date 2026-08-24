"use client";

import { memo } from "react";
import { logout } from "@/lib/actions/auth";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * An official-form blank that can be typed into before printing.
 * Uncontrolled on purpose: React renders the initial value once and never
 * touches the DOM again, so officer edits survive re-renders. Values are
 * print-only - they are not persisted to the database.
 */
export const Editable = memo(function Editable({
  initial = "",
  minWidth,
  block = false,
  center = false,
  ariaLabel,
  className,
}: {
  initial?: string;
  minWidth?: string;
  block?: boolean;
  center?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <span
      dangerouslySetInnerHTML={{ __html: esc(initial) || "<br/>" }}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label={ariaLabel ?? "Editable form field"}
      className={`sf-editable ${block ? "block" : "inline-block"} ${
        center ? "text-center" : ""
      } ${className ?? ""}`}
      style={minWidth ? { minWidth } : undefined}
    />
  );
});

/** Print toolbar shown on screen only. */
export function PrintToolbar({
  backHref,
  title,
}: {
  backHref: string;
  title: string;
}) {
  return (
    <div className="no-print fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-4">
        <a
          href={backHref}
          className="text-sm font-semibold text-content-secondary hover:text-content"
        >
          ← Back
        </a>
        <a
          href="/dashboard"
          className="hidden text-sm font-semibold text-content-secondary hover:text-content sm:block"
        >
          Dashboard
        </a>
      </div>
      <p className="hidden text-xs text-content-secondary lg:block">
        {title} · Click any blank or cell to fill it in, then print.
      </p>
      <div className="flex items-center gap-2">
        <form action={logout}>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-content-secondary hover:bg-surface-secondary hover:text-content"
          >
            Sign out
          </button>
        </form>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          Print / Save PDF
        </button>
      </div>
    </div>
  );
}
