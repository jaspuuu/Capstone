"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileWarning } from "lucide-react";

/**
 * In-browser DOCX preview — renders the actual populated DOCX via docx-preview
 * so nothing needs a server-side PDF renderer. The download button always
 * provides the authoritative DOCX.
 */
export function DocxPreview({
  docxHref,
  label,
}: {
  docxHref: string;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "errored">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    setState("loading");
    setMessage("");

    (async () => {
      try {
        const res = await fetch(docxHref, { credentials: "include" });
        if (!res.ok) {
          if (cancelled) return;
          setMessage("Could not load the document for preview.");
          setState("errored");
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;

        const { renderAsync } = await import("docx-preview");
        if (cancelled) return;

        await renderAsync(blob, container);
        if (!cancelled) setState("ready");
      } catch {
        if (cancelled) return;
        setMessage("The document could not be previewed in your browser.");
        setState("errored");
      }
    })();

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
  }, [docxHref]);

  return (
    <div>
      {state === "loading" && (
        <div className="flex h-[540px] flex-col items-center justify-center gap-2 bg-white text-sm text-content-muted">
          <span
            className="size-5 animate-spin rounded-full border-2 border-content-muted border-t-transparent"
            aria-hidden
          />
          Rendering preview…
        </div>
      )}

      {state === "ready" && (
        <div className="bg-white">
          <div ref={containerRef} className="min-h-[540px] p-4" />
        </div>
      )}

      {state === "errored" && (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <FileWarning className="size-8 text-content-muted" aria-hidden />
          <p className="max-w-md text-sm text-content-secondary">{message}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2 px-6 pb-4 pt-2">
        <a
          href={docxHref}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-primary-strong"
        >
          <Download className="size-4" aria-hidden />
          Download official DOCX
        </a>
      </div>
    </div>
  );
}
