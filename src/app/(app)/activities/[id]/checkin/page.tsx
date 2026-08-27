import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QrCode } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { checkInWindowOpen } from "@/lib/attendance-access";
import { selfCheckIn } from "@/lib/actions/attendance";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { ActionForm } from "@/components/action-form";

export const metadata: Metadata = { title: "Check-in" };


export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { t } = await searchParams;

  const activity = await db.activityProposal.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      venue: true,
      organizationId: true,
      organization: {
        select: {
          name: true,
          members: { where: { isCurrent: true }, select: { userId: true } },
        },
      },
      checkIn: { select: { token: true, closedAt: true } },
    },
  });
  if (!activity) notFound();

  const isMember = activity.organization.members.some((m) => m.userId === user.id);
  const tokenValid = Boolean(activity.checkIn && t && t === activity.checkIn.token);
  const open = activity.checkIn
    ? checkInWindowOpen(activity.checkIn.closedAt, activity.endAt)
    : false;

  const record = await db.activityAttendance.findUnique({
    where: { activityId_userId: { activityId: id, userId: user.id } },
  });

  const alreadyIn =
    record?.source === "QR_CHECKIN" && (record.status === "PRESENT" || record.status === "LATE");

  return (
    <div className="mx-auto max-w-lg py-8">
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-light text-primary">
            <QrCode className="size-7" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-content">{activity.title}</h1>
            <p className="mt-1 text-sm text-content-secondary">
              {activity.organization.name}
              {activity.venue ? ` · ${activity.venue}` : ""}
            </p>
            <p className="text-xs text-content-secondary">
              {formatDateTime(activity.startAt)} – {formatDateTime(activity.endAt)}
            </p>
          </div>

          {!tokenValid ? (
            <Alert tone="danger" title="Invalid QR code">
              This link does not match the current check-in code for this
              activity. Ask an officer to show you the latest QR code.
            </Alert>
          ) : !open ? (
            <Alert tone="warning" title="Check-in closed">
              The check-in window for this activity has closed.
            </Alert>
          ) : !isMember ? (
            <Alert tone="danger" title="Not a member">
              Only current members of {activity.organization.name} can check in.
            </Alert>
          ) : alreadyIn ? (
            <Alert tone="success" title={`You are checked in (${record?.status})`}>
              Recorded {formatDateTime(record!.recordedAt)} via QR check-in.
            </Alert>
          ) : record ? (
            <Alert tone="info" title={`Your attendance is marked ${record.status}`}>
              Confirming here will update it to your QR scan result.
            </Alert>
          ) : null}

          {tokenValid && open && isMember && !alreadyIn && (
            <ActionForm
              action={selfCheckIn}
              submitLabel="Confirm check-in"
              pendingLabel="Checking in…"
              variant="primary"
              size="lg"
              footerClassName="mt-2"
              className="space-y-3"
            >
              <input type="hidden" name="activityId" value={activity.id} />
              <input type="hidden" name="token" value={t ?? ""} />
            </ActionForm>
          )}

          <Link
            href={`/activities/${activity.id}`}
            className="inline-block text-sm font-semibold text-primary hover:underline"
          >
            Back to activity
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
