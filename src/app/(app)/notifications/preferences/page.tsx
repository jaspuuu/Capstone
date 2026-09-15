import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock, Mail } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { getNotificationPreferences } from "@/lib/notification-center";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PreferenceToggle } from "@/components/notifications/preference-toggle";
import { CATEGORY_LABELS, CATEGORY_ORDER, MANDATORY_CATEGORIES } from "@/components/notifications/priority";
import type { NotificationCategory } from "@/generated/prisma/client";
export const instant = false;

export const metadata: Metadata = { title: "Notification preferences" };

const CATEGORY_HELP: Partial<Record<NotificationCategory, string>> = {
  SIGNATURE: "Your signature is requested on a document.",
  REVIEW: "A submission needs your review or approval.",
  REVISION: "A document was returned for correction.",
  DEADLINE: "Upcoming and overdue deadlines for your organizations.",
  APPROVAL: "Approve/reject outcomes on your documents.",
  INTERVIEW: "Accreditation interviews scheduled for your organization.",
  SUBMISSION: "Documents or financial submissions were filed.",
  MEMBERSHIP: "Membership applications and their decisions.",
  ACTIVITY: "Activity proposals and monitoring updates.",
  REPORT: "Accomplishment reports and their reviews.",
  FINANCIAL: "Financial submissions, returns and approvals.",
  FOLLOW_UP: "OSAS follow-ups on your accreditation requirements.",
  SYSTEM: "Platform announcements.",
};

const MANDATORY_HELP =
  "Signature, review, revision and overdue deadlines always notify you — they carry actions you must perform and cannot be muted.";

export default async function NotificationPreferencesPage() {
  const user = await requireUser();
  const prefs = await getNotificationPreferences(user.id);

  return (
    <>
      <PageHeader
        title="Notification preferences"
        description="Choose what reaches you. Action-required workflow steps are always on."
        breadcrumb={[
          { label: "Home", href: "/dashboard" },
          { label: "Notifications", href: "/notifications" },
          { label: "Preferences" },
        ]}
        actions={
          <Link
            href="/notifications"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-content-secondary transition-colors hover:border-primary hover:text-content"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back to notifications
          </Link>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-warning/25 bg-warning-light px-3.5 py-3 text-xs leading-relaxed text-warning">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            {MANDATORY_HELP}
          </p>

          <ul className="divide-y divide-line">
            {CATEGORY_ORDER.map((category) => {
              const locked = MANDATORY_CATEGORIES.includes(category);
              const enabled = locked ? true : prefs[category];
              return (
                <li key={category} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-content">
                      {CATEGORY_LABELS[category]}
                      {locked && <Lock className="size-3.5 text-content-muted" aria-hidden />}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-content-secondary">
                      {CATEGORY_HELP[category]}
                    </p>
                  </div>
                  <PreferenceToggle category={category} enabled={enabled} locked={locked} />
                </li>
              );
            })}
          </ul>

          <p className="mt-6 flex items-start gap-2 rounded-xl bg-surface-secondary/70 px-3.5 py-3 text-xs leading-relaxed text-content-secondary">
            <Mail className="mt-0.5 size-4 shrink-0 text-content-muted" aria-hidden />
            Notifications are delivered inside ORGanIZE only. Muted categories still appear in{" "}
            <Link href="/deadlines" className="mx-1 font-semibold text-primary hover:underline">Deadlines</Link> and on the{" "}
            <Link href="/dashboard" className="font-semibold text-primary hover:underline">dashboard</Link>.
          </p>
        </CardContent>
      </Card>
    </>
  );
}