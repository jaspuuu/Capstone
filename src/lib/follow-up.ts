import { FOLLOW_UP_STATUS_META } from "@/lib/constants";

/** §24: the official work instruction requires a follow-up one week after submission. */
export const FOLLOW_UP_WINDOW_DAYS = 7;

/** §24: derived expected follow-up date = submission date + one week. */
export function expectedFollowUpDate(submittedAt: Date): Date {
  const d = new Date(submittedAt);
  d.setDate(d.getDate() + FOLLOW_UP_WINDOW_DAYS);
  return d;
}

export type FollowUpView = {
  id: string;
  expectedDate: Date;
  status: string;
  notes: string | null;
  completedAt: Date | null;
  completedBy?: { firstName: string; lastName: string } | null;
};

export { FOLLOW_UP_STATUS_META };