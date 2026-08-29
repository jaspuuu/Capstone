import type { ReactNode } from "react";
export const instant = false;

/**
 * Printable record views (`/print/...`): same paper-only treatment as the
 * `(print)` route group, minus the shell. Session is enforced by proxy.ts
 * and by each page's own authorization check.
 */
export default function PrintRecordLayout({ children }: { children: ReactNode }) {
  return <div className="print-root">{children}</div>;
}