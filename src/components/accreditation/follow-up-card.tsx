"use client";

import { CalendarClock, AlertTriangle, CheckCircle2, PhoneCall, CircleDashed, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/action-form";
import { Select } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";
import { FOLLOW_UP_STATUS_META, FOLLOW_UP_WINDOW_DAYS, type FollowUpView } from "@/lib/follow-up";
import { recordFollowUp } from "@/lib/actions/follow-up";

/**
 * §24: the official work instruction requires a follow-up one week after
 * submission. Shows the automated expected date, current status, and lets a
 * reviewer record the outcome. The one-week window is computed server-side.
 */
export function FollowUpCard({
  followUp,
  canReview,
}: {
  followUp: FollowUpView | null;
  canReview: boolean;
}) {
  if (!followUp) return null;

  const meta = FOLLOW_UP_STATUS_META[followUp.status] ?? { label: followUp.status, tone: "neutral" as const };
  const isOverdue =
    followUp.status !== "COMPLETED" &&
    followUp.status !== "SKIPPED" &&
    new Date() > followUp.expectedDate;

  const statusOptions = [
    { value: "PENDING", label: "Pending" },
    { value: "CONTACTED", label: "Contacted" },
    { value: "COMPLETED", label: "Completed" },
    { value: "OVERDUE", label: "Overdue" },
    { value: "SKIPPED", label: "Skipped" },
  ];

  return (
    <Card>
      <CardHeader
        icon={CalendarClock}
        title="Follow-up"
        description={`Required one week (${FOLLOW_UP_WINDOW_DAYS} days) after submission`}
      />
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-secondary p-3">
          <div className="flex items-center gap-2">
            {isOverdue ? (
              <AlertTriangle className="size-5 text-danger" aria-hidden />
            ) : followUp.status === "COMPLETED" ? (
              <CheckCircle2 className="size-5 text-success" aria-hidden />
            ) : followUp.status === "CONTACTED" ? (
              <PhoneCall className="size-5 text-primary" aria-hidden />
            ) : followUp.status === "SKIPPED" ? (
              <XCircle className="size-5 text-content-muted" aria-hidden />
            ) : (
              <CircleDashed className="size-5 text-content-muted" aria-hidden />
            )}
            <div>
              <p className="text-sm font-semibold text-content">
                Expected: {formatDate(followUp.expectedDate)}
                {isOverdue && <span className="ml-2 text-xs font-bold text-danger">Overdue</span>}
              </p>
              {followUp.completedAt && followUp.completedBy && (
                <p className="text-xs text-content-secondary">
                  Completed {formatDate(followUp.completedAt)} by {followUp.completedBy.firstName}{" "}
                  {followUp.completedBy.lastName}
                </p>
              )}
            </div>
          </div>
          <Badge tone={meta.tone}>
            {meta.label}
          </Badge>
        </div>

        {followUp.notes && (
          <p className="rounded-lg border border-line bg-surface-secondary/50 px-3 py-2 text-xs text-content-secondary">
            {followUp.notes}
          </p>
        )}

        {canReview && followUp.status !== "COMPLETED" && (
          <ActionForm action={recordFollowUp} submitLabel="Save follow-up" className="pt-1">
            <input type="hidden" name="id" value={followUp.id} />
            <div className="space-y-2">
              <Select id="ff-status" name="status" defaultValue={followUp.status}>
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <textarea
                name="note"
                rows={2}
                placeholder="Follow-up notes…"
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-content placeholder:text-content-muted"
              />
            </div>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}