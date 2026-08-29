import QRCode from "qrcode";
import { headers } from "next/headers";
import Link from "next/link";
import { ClipboardCheck, Printer, QrCode, UserCheck } from "lucide-react";
import { db } from "@/lib/db";
import { formatDateTime, fullName } from "@/lib/utils";
import {
  ATTENDANCE_STATUS_META,
  MEMBER_POSITION_LABELS,
} from "@/lib/constants";
import { checkInWindowOpen } from "@/lib/attendance-access";
import {
  endCheckIn,
  markAttendance,
  startCheckIn,
} from "@/lib/actions/attendance";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm, QuickActionForm } from "@/components/action-form";

type ActivityRef = {
  id: string;
  title: string;
  status: string;
  startAt: Date;
  endAt: Date;
  academicYear: string;
  organizationId: string;
};

/**
 * Server-rendered attendance roster + QR check-in controls for an activity.
 * `canManage` gates officer controls; everyone who can view the activity can
 * see the roster and their own status.
 */
export async function AttendanceCard({
  activity,
  viewerId,
  canManage,
}: {
  activity: ActivityRef;
  viewerId: string;
  canManage: boolean;
}) {
  const [roster, records, checkIn] = await Promise.all([
    db.organizationMember.findMany({
      where: {
        organizationId: activity.organizationId,
        isCurrent: true,
        academicYear: activity.academicYear,
      },
      select: {
        userId: true,
        position: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ position: "asc" }, { user: { lastName: "asc" } }],
    }),
    db.activityAttendance.findMany({ where: { activityId: activity.id } }),
    db.activityCheckIn.findUnique({ where: { activityId: activity.id } }),
  ]);

  const byUser = new Map(records.map((r) => [r.userId, r]));
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
  for (const r of records) counts[r.status] += 1;
  const unrecorded = roster.filter((m) => !byUser.has(m.userId)).length;

  const windowOpen = checkIn ? checkInWindowOpen(checkIn.closedAt, activity.endAt) : false;
  const qrCount = records.filter((r) => r.source === "QR_CHECKIN").length;

  let qrSvg: string | null = null;
  let checkInUrl: string | null = null;
  if (canManage && checkIn && windowOpen && checkIn.token) {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    checkInUrl = `${proto}://${host}/activities/${activity.id}/checkin?t=${checkIn.token}`;
    qrSvg = await QRCode.toString(checkInUrl, { type: "svg", margin: 1, width: 200 });
  }

  const mine = byUser.get(viewerId);

  return (
    <Card>
      <CardHeader
        icon={ClipboardCheck}
        title="Attendance & Participation"
        description={
          canManage
            ? "Record attendance manually or open a QR check-in window."
            : `Roster for AY ${activity.academicYear}.`
        }
      />
      <CardContent className="space-y-5">
        {/* Summary */}
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-success-light px-3 py-1 text-success">
            Present {counts.PRESENT}
          </span>
          <span className="rounded-full bg-warning-light px-3 py-1 text-warning">
            Late {counts.LATE}
          </span>
          <span className="rounded-full bg-danger-light px-3 py-1 text-danger">
            Absent {counts.ABSENT}
          </span>
          <span className="rounded-full bg-info-light px-3 py-1 text-info">
            Excused {counts.EXCUSED}
          </span>
          {unrecorded > 0 && (
            <span className="rounded-full bg-surface-secondary px-3 py-1 text-content-secondary">
              No record {unrecorded}
            </span>
          )}
        </div>

        {/* Viewer's own status */}
        {mine && (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-secondary px-4 py-3 text-sm">
            <UserCheck className="size-4 text-primary" aria-hidden />
            <span className="text-content-secondary">Your attendance:</span>
            <Badge tone={ATTENDANCE_STATUS_META[mine.status].tone}>
              {ATTENDANCE_STATUS_META[mine.status].label}
            </Badge>
            <span className="text-xs text-content-secondary">
              via {mine.source === "QR_CHECKIN" ? "QR check-in" : "manual entry"} ·{" "}
              {formatDateTime(mine.recordedAt)}
            </span>
          </div>
        )}

        {/* Officer controls */}
        {canManage && (
          <div className="rounded-xl border border-line p-4">
            {!checkIn && (
              <>
                <p className="text-sm font-bold text-content">QR check-in</p>
                <p className="mt-0.5 mb-3 text-xs text-content-secondary">
                  Opens a scannable code members use to check themselves in. The
                  window stays open until you close it (or 24 hours after the
                  activity ends).
                </p>
                <QuickActionForm
                  action={startCheckIn}
                  hidden={{ activityId: activity.id }}
                  label="Open check-in window"
                  variant="primary"
                />
              </>
            )}
            {checkIn && windowOpen && (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {qrSvg && (
                  <div
                    className="shrink-0 rounded-xl border border-line bg-white p-2 [&>svg]:block"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-content">
                    <QrCode className="size-4 text-primary" aria-hidden />
                    Check-in is open
                  </p>
                  <p className="text-xs text-content-secondary">
                    {qrCount} member{qrCount === 1 ? "" : "s"} checked in via QR.
                    Ask members to scan this code at the venue.
                  </p>
                  {checkInUrl && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate rounded-md bg-surface-secondary px-2 py-1 font-mono text-[11px] text-content-secondary">
                        {checkInUrl}
                      </p>
                      <Link
                        href={`/print/activities/${activity.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <Printer className="size-3.5" aria-hidden />
                        Print poster
                      </Link>
                    </div>
                  )}
                  <QuickActionForm
                    action={endCheckIn}
                    hidden={{ activityId: activity.id }}
                    label="Close check-in"
                    confirmMessage="Close the check-in window? Members will no longer be able to scan in."
                    variant="outline"
                  />
                </div>
              </div>
            )}
            {checkIn && !windowOpen && (
              <>
                <p className="text-sm font-bold text-content">Check-in closed</p>
                <p className="mt-0.5 mb-3 text-xs text-content-secondary">
                  Reopening generates a new code - previously scanned links stop
                  working.
                </p>
                <QuickActionForm
                  action={startCheckIn}
                  hidden={{ activityId: activity.id }}
                  label="Reopen with new code"
                  variant="outline"
                />
              </>
            )}
          </div>
        )}

        {/* Roster */}
        {roster.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No members"
            description={`No current members are enrolled for AY ${activity.academicYear}.`}
          />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {roster.map((m) => {
              const rec = byUser.get(m.userId);
              return (
                <li key={m.userId} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-content">
                        {fullName(m.user)}
                        {m.userId === viewerId && (
                          <span className="ml-1.5 text-xs font-normal text-content-secondary">
                            (you)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-content-secondary">
                        {MEMBER_POSITION_LABELS[m.position]}
                        {rec && (
                          <>
                            {" · "}
                            {rec.source === "QR_CHECKIN" ? "QR check-in" : "manual"} ·{" "}
                            {formatDateTime(rec.recordedAt)}
                          </>
                        )}
                      </p>
                    </div>
                    {rec && (
                      <Badge tone={ATTENDANCE_STATUS_META[rec.status].tone}>
                        {ATTENDANCE_STATUS_META[rec.status].label}
                      </Badge>
                    )}
                  </div>
                  {canManage && (
                    <ActionForm
                      action={markAttendance}
                      submitLabel="Save"
                      variant="ghost"
                      size="sm"
                      footerClassName="mt-2"
                      className="mt-2 flex flex-wrap items-end gap-2 border-t border-line pt-2"
                    >
                      <input type="hidden" name="activityId" value={activity.id} />
                      <input type="hidden" name="memberId" value={m.userId} />
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-content-secondary">
                          Status
                        </span>
                        <select
                          name="status"
                          defaultValue={rec?.status ?? ""}
                          required
                          className="h-9 rounded-lg border border-line-strong bg-surface px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                        >
                          <option value="" disabled>
                            Set status…
                          </option>
                          {Object.entries(ATTENDANCE_STATUS_META).map(([value, meta]) => (
                            <option key={value} value={value}>
                              {meta.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block min-w-40 flex-1">
                        <span className="mb-1 block text-[11px] font-medium text-content-secondary">
                          Remarks (optional)
                        </span>
                        <input
                          type="text"
                          name="remarks"
                          defaultValue={rec?.remarks ?? ""}
                          maxLength={300}
                          placeholder="e.g. informed beforehand"
                          className="h-9 w-full rounded-lg border border-line-strong bg-surface px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                        />
                      </label>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
