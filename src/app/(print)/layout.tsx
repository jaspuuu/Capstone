import type { ReactNode } from "react";

/**
 * Print-form route group: no app shell, just the paper. Session is enforced
 * by proxy.ts and by each page's own authorization check.
 */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return <div className="print-root">{children}</div>;
}
