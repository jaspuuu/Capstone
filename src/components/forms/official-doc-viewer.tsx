import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, LogOut } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { getFormTemplate } from "@/lib/forms-registry";
import { SfFormMeta } from "@/components/forms/sf-chrome";
import { SignatureRouteSection } from "@/components/forms/signature-route-section";
import { PdfPreview } from "@/components/forms/pdf-preview";

/**
 * Official OSAS document viewer (screen only — never prints a recreation).
 *
 * The populated DOCX generated from the master template is the official form.
 * This page shows the signature workflow and renders the document for on-screen
 * review — via PDF when Microsoft Word is available on the server, otherwise as
 * an in-browser DOCX preview. The DOCX download remains the authoritative
 * deliverable.
 */
export function OfficialDocViewer({
  formKey,
  orgId,
  ay,
  backHref,
}: {
  formKey: "SF001" | "SF002" | "SF003" | "SF004" | "SF005" | "SF006";
  orgId: string;
  ay: string;
  backHref: string;
}) {
  const code = `LSPU-OSAS-${formKey}`;
  const template = getFormTemplate(code);
  const basename = encodeURIComponent(formKey.toLowerCase());
  const ayParam = encodeURIComponent(ay);
  const docxHref = `/api/org/${orgId}/documents/${basename}/export?ay=${ayParam}`;
  const pdfHref = `${docxHref}&format=pdf`;

  return (
    <main className="min-h-dvh bg-surface-secondary">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-content-secondary hover:border-line-strong hover:text-content"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Back
            </Link>
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight text-content">
                {template?.formName ?? formKey}
              </h1>
              <p className="text-xs text-content-muted">
                Official {code} · AY {ay}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={pdfHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-content-secondary hover:border-line-strong hover:text-content"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Open PDF
            </a>
            <a
              href={docxHref}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white shadow-card hover:bg-primary-strong"
            >
              <Download className="size-3.5" aria-hidden />
              Download DOCX
            </a>
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-content-secondary hover:border-line-strong hover:text-content"
              >
                <LogOut className="size-3.5" aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        </header>

        <SfFormMeta code={code} />

        <SignatureRouteSection formKey={formKey} orgId={orgId} ay={ay} title={code} />

        <section className="mt-4 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-content">Populated official document</p>
            <a
              href={docxHref}
              className="text-xs font-semibold text-primary hover:text-primary-strong"
            >
              Download the authoritative DOCX instead
            </a>
          </div>
          <PdfPreview pdfHref={pdfHref} docxHref={docxHref} label={code} />
        </section>

        <p className="mt-3 text-xs text-content-muted">
          This preview renders the populated official document for on-screen review.
          When a server-side renderer (Microsoft Word) is available, a PDF is shown;
          otherwise the DOCX is rendered in your browser. The downloaded DOCX is the
          official document — review it in Office before submitting.
        </p>
      </div>
    </main>
  );
}