import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { canManageAttendance, checkInWindowOpen } from "@/lib/attendance-access";
import type { ParentRef } from "@/lib/attachment-access";
import { formatDateTime } from "@/lib/utils";
import { PrintToolbar } from "@/components/forms/editable";
export const instant = false;

export const metadata: Metadata = { title: "Check-in poster" };

/**
 * Letter-size QR check-in poster officers print and post at the venue.
 * Embeds the same token used by the on-screen QR, so members scan once.
 */
export default async function CheckInPosterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const activity = await db.activityProposal.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      startAt: true,
      endAt: true,
      venue: true,
      organizationId: true,
      organization: {
        select: {
          name: true,
          acronym: true,
          collegeId: true,
          members: { where: { isCurrent: true }, select: { userId: true, position: true } },
        },
      },
      checkIn: { select: { token: true, closedAt: true } },
    },
  });
  if (!activity) notFound();

  const parent: ParentRef = {
    id: activity.id,
    status: activity.status,
    organizationId: activity.organizationId,
    organization: {
      collegeId: activity.organization.collegeId,
      members: activity.organization.members,
    },
  };
  if (!canManageAttendance(user, parent)) notFound();

  const open = activity.checkIn
    ? checkInWindowOpen(activity.checkIn.closedAt, activity.endAt)
    : false;

  if (!activity.checkIn?.token || !open) {
    return (
      <>
        <PrintToolbar backHref={`/activities/${activity.id}`} title="Check-in poster" />
        <div className="mx-auto max-w-[210mm] p-8 text-center">
          <p className="text-lg font-bold">No open check-in window</p>
          <p className="mt-2 text-sm">Open a check-in window on the activity page to print a poster.</p>
        </div>
      </>
    );
  }

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const checkInUrl = `${proto}://${host}/activities/${activity.id}/checkin?t=${activity.checkIn.token}`;
  const qrSvg = await QRCode.toString(checkInUrl, { type: "svg", margin: 1, width: 512 });

  return (
    <>
      <PrintToolbar backHref={`/activities/${activity.id}`} title="Check-in poster" />
      <div className="mx-auto w-[210mm] bg-white p-8">
        <div className="flex flex-col items-center justify-center rounded-2xl border-[6px] border-primary p-8 text-center">
          <p className="font-display text-[11pt] font-bold uppercase tracking-[0.25em] text-primary">
            Wait for the officer&apos;s signal
          </p>
          <p className="mt-1 text-sm text-content-secondary">
            {activity.organization.acronym ?? activity.organization.name}
          </p>

          <h1 className="mt-6 max-w-[150mm] font-display text-[26pt] font-bold leading-tight text-content">
            {activity.title}
          </h1>

          <p className="mt-3 text-[14pt] font-semibold text-content">
            {activity.venue ?? "See activity details"}
          </p>
          <p className="mt-1 text-[12pt] text-content-secondary">
            {formatDateTime(activity.startAt)}
            {activity.endAt && activity.endAt.getTime() !== activity.startAt.getTime()
              ? ` – ${formatDateTime(activity.endAt)}`
              : ""}
          </p>

          <div
            className="mx-auto mt-8 w-[70mm] rounded-2xl bg-white p-3 shadow-card"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />

          <div className="mt-8 space-y-1">
            <p className="text-[16pt] font-bold text-content">Scan to check in</p>
            <p className="mx-auto max-w-[120mm] text-[11pt] text-content-secondary">
              Open your phone camera, point it at the code, and confirm your check-in when prompted.
            </p>
            <p className="text-[10pt] uppercase tracking-wide text-content-muted">
              One scan per member · LSPU OSAS attendance system
            </p>
          </div>
        </div>
      </div>
    </>
  );
}