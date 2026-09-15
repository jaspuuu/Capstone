"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileWarning, MousePointerClick } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import { FORM_FIELD_MAPS, type FieldRect } from "@/lib/form-field-map";
import { FORM_DRAFT_FIELDS } from "@/lib/form-draft-data";

// pdf.js worker is an asset module, never bundled into the main chunk.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const FIELD_LABEL = new Map<string, string>(FORM_DRAFT_FIELDS.map((f) => [f.key, f.label]));

type PageRow = { num: number; w: number; h: number; rects: Array<{ key: string; rect: FieldRect }> };

/**
 * Edit-mode preview: renders the real populated PDF (same production bytes as
 * the "Open PDF" download) with pdf.js and overlays the field-map rectangles so
 * each editable value's landing position is visible. Pure screen aid — the
 * official document itself is never modified.
 */
export function PdfFieldPreview({
  formKey,
  pdfHref,
  docxHref,
  label,
  activeField,
  onSelectField,
}: {
  formKey: string;
  pdfHref: string;
  docxHref: string;
  label: string;
  activeField: string | null;
  onSelectField?: (key: string | null) => void;
}) {
  const [attemptKey, setAttemptKey] = useState(0);
  const [activeRect, setActiveRect] = useState<string | null>(null);
  const focusedKey = activeField ?? activeRect;

  // Changing the href (draft saved → version cache-buster) or pressing Retry
  // remounts the body via `key`, so the inner component always starts fresh in
  // its "loading" initial state (never setState synchronously inside an effect).
  const viewKey = `${pdfHref}|${attemptKey}`;

  return (
    <PdfFieldPreviewBody
      key={viewKey}
      formKey={formKey}
      pdfHref={pdfHref}
      docxHref={docxHref}
      label={label}
      focusedKey={focusedKey}
      onSelectField={onSelectField}
      onRetry={() => setAttemptKey((k) => k + 1)}
      onHoverRect={setActiveRect}
    />
  );
}

function PdfFieldPreviewBody({
  formKey,
  pdfHref,
  docxHref,
  label,
  focusedKey,
  onSelectField,
  onRetry,
  onHoverRect,
}: {
  formKey: string;
  pdfHref: string;
  docxHref: string;
  label: string;
  focusedKey: string | null;
  onSelectField?: (key: string | null) => void;
  onRetry: () => void;
  onHoverRect: (key: string | null) => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "errored">("loading");
  const [message, setMessage] = useState("");
  const [pages, setPages] = useState<Array<PageRow & { dataUrl: string }>>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const map = FORM_FIELD_MAPS[formKey] ?? {};
    let cancelled = false;
    let url: string | null = null;

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
            setMessage(
              hint === "word_busy"
                ? "The official DOCX was generated successfully, but a Microsoft Word window is currently open, so the PDF could not be rendered. Close Word and press Retry."
                : hint === "word_unavailable"
                  ? "The official DOCX was generated successfully, but the PDF preview needs Microsoft Word installed on this server. The official DOCX below remains available."
                  : "The official DOCX was generated successfully, but PDF preview is currently unavailable on this server.",
            );
          } else {
            setMessage("The document preview could not be rendered right now.");
          }
          setStatus("errored");
          return;
        }
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        const loaded = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
        if (cancelled) {
          await loaded.cleanup();
          return;
        }
        const rows: PageRow[] = [];
        for (let n = 1; n <= loaded.numPages; n += 1) {
          const page = await loaded.getPage(n);
          const viewport = page.getViewport({ scale: 1 });
          const rects = Object.entries(map)
            .flatMap(([key, list]) =>
              list
                .filter((r) => r.page === n)
                .map((rect) => ({ key, rect })),
            )
            .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
          rows.push({ num: n, w: viewport.width, h: viewport.height, rects });
        }

        // Render every page to its own canvas, then snapshot to data URLs so
        // the canvases (and this effect's scope) can be released immediately.
        const snapshots = await Promise.all(
          rows.map(async (row) => {
            const page = await loaded.getPage(row.num);
            const scale = Math.max(1.2, Math.min(3, 980 / row.w));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext("2d", { alpha: true });
            if (!ctx) throw new Error("Canvas 2D is unavailable");
            const task = page.render({ canvas, canvasContext: ctx, viewport } as never);
            await task.promise;
            return { num: row.num, dataUrl: canvas.toDataURL("image/png") };
          })
        );
        if (cancelled) return;
        setPages(
          rows.map((row) => ({
            ...row,
            dataUrl: snapshots.find((s) => s.num === row.num)?.dataUrl ?? "",
          })),
        );
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setMessage("The document preview could not be loaded. The official DOCX below remains available.");
        setStatus("errored");
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pdfHref, formKey]);

  return (
    <div ref={rootRef}>
      {status === "loading" && (
        <div className="flex h-[540px] flex-col items-center justify-center gap-2 bg-white text-sm text-content-muted">
          <span className="size-5 animate-spin rounded-full border-2 border-content-muted border-t-transparent" aria-hidden />
          Rendering the populated official document with field markers…
        </div>
      )}

      {status === "errored" && (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center bg-white">
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
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-content-secondary shadow-card hover:bg-background-secondary"
            >
              Retry preview
            </button>
          </div>
        </div>
      )}

      {status === "ready" && (
        <div className="bg-white">
          {pages.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-content-muted">
              No field markers to show for this document.
            </p>
          ) : (
            <div className="space-y-4 px-4 py-4">
              {pages.map((row) => (
                <div key={row.num} className="relative mx-auto w-full max-w-[980px] border border-line bg-white shadow-card">
                  {/* eslint-disable-next-line @next/next/no-img-element -- in-memory canvas snapshot */}
                  <img
                    src={row.dataUrl}
                    alt={`${label} — page ${row.num} (populated official document)`}
                    className="block h-auto w-full"
                    draggable={false}
                  />
                  <div className="pointer-events-none absolute inset-0">
                    {row.rects.map(({ key, rect }, ri) => {
                      const isFocused = focusedKey === key;
                      return (
                        <button
                          key={`${key}-${ri}`}
                          type="button"
                          onMouseEnter={() => onHoverRect(key)}
                          onMouseLeave={() => onHoverRect(null)}
                          onClick={() => onSelectField?.(isFocused ? null : key)}
                          aria-label={`${FIELD_LABEL.get(key) ?? key} — page ${rect.page}`}
                          className="pointer-events-auto absolute cursor-pointer outline-none"
                          style={{
                            left: `${rect.x * 100}%`,
                            top: `${rect.y * 100}%`,
                            width: `${rect.w * 100}%`,
                            height: `${rect.h * 100}%`,
                          }}
                        >
                          <span
                            className={`block h-full w-full transition-all duration-150 ${
                              isFocused
                                ? "border-2 border-blue-600 ring-2 ring-blue-400/60 bg-blue-400/25"
                                : "border border-dashed border-blue-400/80 bg-blue-300/15 hover:border-blue-600 hover:bg-blue-400/25"
                            }`}
                          />
                          {isFocused && (
                            <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-card">
                              {FIELD_LABEL.get(key) ?? key}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 text-[11px] text-content-muted">
                  <MousePointerClick className="size-3.5" aria-hidden />
                  Colored outlines mark where each editable value lands on the official PDF. Click an
                  outline to select its field; hover a field on the right to locate it.
                </p>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-content-muted">
                  Screen aid — the official PDF is unchanged
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}