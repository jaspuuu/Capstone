"use client";

import { useEffect } from "react";

/**
 * Guards a dirty form against losing work:
 *  1. `beforeunload` warns on refresh / tab close.
 *  2. Any same-origin in-page navigation (Link clicks, programmatic anchors)
 *     is intercepted first so the user can choose to stay.
 *
 * Usage: call `useExitGuard(dirty)` inside the component that owns the edit
 * state; `dirty` flips true as soon as the user changes a field.
 */
export function useExitGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;

    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.(
        "a[href]"
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname === window.location.pathname
      ) {
        return;
      }
      if (!window.confirm("You have unsaved changes. Leave this page?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);
}