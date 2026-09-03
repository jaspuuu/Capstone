"use client";

import { CheckCircle2, CircleDashed, AlertCircle, Clock } from "lucide-react";

export function RequirementStatusChip({
  met,
  status,
}: {
  met: boolean;
  status: "REQUIRED" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "RETURNED";
}) {
  if (met) {
    return <CheckCircle2 className="size-4.5 shrink-0 text-green-600" aria-hidden />;
  }

  switch (status) {
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return <Clock className="size-4.5 shrink-0 text-primary" aria-hidden />;
    case "RETURNED":
      return <AlertCircle className="size-4.5 shrink-0 text-warning" aria-hidden />;
    default:
      return <CircleDashed className="size-4.5 shrink-0 text-content-muted" aria-hidden />;
  }
}