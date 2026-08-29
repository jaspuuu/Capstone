import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Users, ClipboardList, Award, RefreshCw, ScrollText } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
export const instant = false;

export const metadata: Metadata = { title: "Form Library" };

const FORMS = [
  {
    code: "SF-001",
    title: "Application for Recognition/Renewal",
    desc: "Application letter to the OSAS Director with the CHED Memo No. 9 s. 2013 requirements checklist (4 copies each).",
    href: "/forms/sf-001",
    icon: Award,
  },
  {
    code: "SF-002",
    title: "Organization Renewal Form",
    desc: "Renewal request letter addressed thru the Coordinator, Student Organization Unit.",
    href: "/forms/sf-002",
    icon: RefreshCw,
  },
  {
    code: "SF-003",
    title: "Organization Adviser Commitment Form",
    desc: "Adviser's commitment letter with name, college, academic rank and contact details.",
    href: "/forms/sf-003",
    icon: ScrollText,
  },
  {
    code: "SF-004",
    title: "Plan of Activities",
    desc: "One activity per page — objective, description, persons involved, target date and budget.",
    href: "/forms/sf-004",
    icon: ClipboardList,
  },
  {
    code: "SF-005",
    title: "List of Members of the Organization",
    desc: "Member roster with 1×1 picture boxes, signature-over-printed-name, student number and course/year/section.",
    href: "/forms/sf-005",
    icon: Users,
  },
  {
    code: "SF-006",
    title: "Certification",
    desc: "Dean's certification of bonafide membership, good academic and disciplinary standing.",
    href: "/forms/sf-006",
    icon: FileText,
  },
];

/** Hub for all official OSAS student forms (print-perfect replicas). */
export default async function FormLibraryPage() {
  await requireUser();

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-content">Form Library</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Official LSPU-OSAS student forms, pre-filled from system data. Every blank stays editable
          before you print or save as PDF.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {FORMS.map((f) => (
          <Link
            key={f.code}
            href={f.href}
            className="group rounded-xl border border-line bg-surface p-5 shadow-sm transition-colors hover:border-primary"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
                <f.icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
                  {f.code}
                </p>
                <h2 className="font-display text-sm font-bold text-content group-hover:text-primary">
                  {f.title}
                </h2>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-content-secondary">{f.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
