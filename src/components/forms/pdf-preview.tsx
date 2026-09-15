"use client";

import { useEffect, useState } from "react";
import { Download, FileWarning } from "lucide-react";
import { DocxPreview } from "@/components/forms/docx-preview";

/**
 * Renders the populated PDF when a server-side renderer (Microsoft Word) is
 * available, or falls back to an in-browser DOCX preview so the document is
 * always visible. The authoritative DOCX download is always shown.
 */
export function PdfPreview({
  pdfHref,
  docxHref,
  label,
}: {
  pdfHref: string;
  docxHref: string;
  label: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "errored" | "docx-fallback">(
    "loading",
  );
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setState("loading");
    setMessage("");

    (async () => {
      try {
        const res = await fetch(pdfHref, { credentials: "include" });
        const ct = res.headers.get("content-type") ?? "";
        if (!res.ok || !ct.includes("application/pdf")) {
          if (cancelled) return;
          if (res.status === 422) {
            const hint = (await res.json().catch(() => null))?.hint as
              | "word_busy"
              | "word_unavailable"
              | "conversion_failed"
              | undefined;
            if (hint === "word_busy") {
              setMessage(
                "The official DOCX was generated successfully, but a Microsoft Word window is currently open, so the PDF could not be rendered. Close Word and press Retry.",
              );
              setState("errored");
              return;
            }
          }
          // Server-side PDF unavailable (e.g. Linux/Vercel) — render in-browser.
          setState("docx-fallback");
          return;
        }
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setBlobUrl(url);
        setState("ready");
      } catch {
        if (cancelled) return;
        setMessage(
          "The document preview could not be loaded. The official DOCX below remains available.",
        );
        setState("errored");
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pdfHref, retryKey]);

  if (state === "docx-fallback") {
    return <DocxPreview docxHref={docxHref} label={label} />;
  }

  return (
    <div>
      {state === "loading" && (
        <div className="flex h-[540px] flex-col items-center justify-center gap-2 bg-white text-sm text-content-muted">
          <span
            className="size-5 animate-spin rounded-full border-2 border-content-muted border-t-transparent"
            aria-hidden
          />
          Rendering the populated official document…
        </div>
      )}

      {state === "errored" && (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <FileWarning className="size-8 text-content-muted" aria-hidden />
          <p className="max-w-md text-sm text-content-secondary">{message}</p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <a
              href={docxHref}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-primary-strong"
            >
              <Download className="size-4" aria-hidden />
              Download official DOCX
            </a>
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-content-secondary shadow-card hover:bg-background-secondary"
            >
              Retry preview
            </button>
          </div>
        </div>
      )}

      {state === "ready" && blobUrl && (
        <iframe
          src={blobUrl}
          title={`${label} populated document (PDF)`}
          className="block w-full border-0 bg-white"
          style={{ height: "1080px" }}
        />
      )}
    </div>
  );
}