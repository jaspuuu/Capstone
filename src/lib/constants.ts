import type { Role } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Role labels
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<Role, string> = {
  OSAS: "OSAS Administrator",
  SOA: "SOA Administrator",
  DEAN: "College Dean",
  ADVISER_REGULAR: "Regular Faculty Adviser",
  ADVISER_PARTTIME: "Part-Time Faculty Adviser",
  PRESIDENT: "Organization President",
  SECRETARY: "Organization Secretary",
  MEMBER: "Organization Member",
};

export const SHORT_ROLE_LABELS: Record<Role, string> = {
  OSAS: "OSAS",
  SOA: "SOA",
  DEAN: "Dean",
  ADVISER_REGULAR: "Adviser (Regular)",
  ADVISER_PARTTIME: "Adviser (Part-Time)",
  PRESIDENT: "President",
  SECRETARY: "Secretary",
  MEMBER: "Member",
};

export const ADMIN_ROLES: Role[] = ["OSAS", "SOA"];

// ---------------------------------------------------------------------------
// Status labels + badge tones.
// Tone drives color AND icon so status never depends on color alone (§38).
// ---------------------------------------------------------------------------

export type BadgeTone =
  | "success"
  | "warning"
  | "info"
  | "orange"
  | "danger"
  | "neutral"
  | "gold"
  | "primary";

type StatusMeta = { label: string; tone: BadgeTone };

export const RECOGNITION_STATUS_META: Record<string, StatusMeta> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Pending", tone: "warning" },
  UNDER_REVIEW: { label: "Under Review", tone: "info" },
  FOR_APPROVAL: { label: "For Approval", tone: "info" },
  APPROVED: { label: "Approved", tone: "success" },
  RECOGNIZED: { label: "Recognized", tone: "gold" },
  RETURNED: { label: "Returned", tone: "orange" },
  REJECTED: { label: "Rejected", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

export const ORG_STATE_META: Record<string, StatusMeta> = {
  RECOGNIZED: { label: "Recognized", tone: "gold" },
  PENDING_RENEWAL: { label: "Pending Renewal", tone: "warning" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
  REJECTED: { label: "Rejected", tone: "danger" },
  ACTIVE: { label: "Active", tone: "success" },
};

export const PROPOSAL_STATUS_META: Record<string, StatusMeta> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Pending", tone: "warning" },
  ENDORSED: { label: "Endorsed", tone: "info" },
  APPROVED: { label: "Approved", tone: "success" },
  RETURNED: { label: "Returned", tone: "orange" },
  REJECTED: { label: "Rejected", tone: "danger" },
  COMPLETED: { label: "Completed", tone: "gold" },
};

export const REPORT_STATUS_META: Record<string, StatusMeta> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Pending", tone: "warning" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  RETURNED: { label: "Returned", tone: "orange" },
};

export const ACTIVITY_SCOPE_LABELS: Record<string, string> = {
  ORGANIZATION: "Organization-wide",
  COLLEGE: "College-wide",
  UNIVERSITY: "University-wide",
};

export const DEADLINE_PROCESS_LABELS: Record<string, string> = {
  RECOGNITION: "Recognition Application",
  RENEWAL: "Recognition Renewal",
  ACTIVITY: "Activity Proposal",
  ACCOMPLISHMENT: "Accomplishment Report",
  OTHER: "Other Submission",
};

export const ORG_TYPE_LABELS: Record<string, string> = {
  MOTHER: "Mother Organization",
  CHILD: "Sub-Organization",
  INDEPENDENT: "Independent Organization",
};

export const ADVISER_TYPE_LABELS: Record<string, string> = {
  REGULAR: "Regular Faculty Adviser",
  PART_TIME: "Part-Time Faculty Adviser",
};

export const MEMBER_POSITION_LABELS: Record<string, string> = {
  PRESIDENT: "President",
  SECRETARY: "Secretary",
  MEMBER: "Member",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  LOGIN_FAILED: "Failed sign-in attempt",
  PASSWORD_CHANGED: "Changed password",
  USER_CREATED: "Created user account",
  USER_UPDATED: "Updated user account",
  USER_DEACTIVATED: "Deactivated user account",
  USER_ACTIVATED: "Reactivated user account",
  COLLEGE_CREATED: "Created college",
  COLLEGE_UPDATED: "Updated college",
  DEPARTMENT_CREATED: "Created department",
  ORGANIZATION_CREATED: "Created organization",
  ORGANIZATION_UPDATED: "Updated organization",
  ORGANIZATION_ARCHIVED: "Archived organization",
  ORGANIZATION_RESTORED: "Restored organization",
  ADVISER_ASSIGNED: "Assigned adviser",
  ADVISER_REMOVED: "Removed adviser assignment",
  MEMBER_ADDED: "Added member",
  MEMBER_REMOVED: "Removed member",
  APPLICATION_CREATED: "Created application",
  APPLICATION_SUBMITTED: "Submitted application",
  REVIEW_STARTED: "Started review",
  ENDORSED_FOR_APPROVAL: "Endorsed for approval",
  APPLICATION_RETURNED: "Returned application",
  APPLICATION_APPROVED: "Approved application",
  APPLICATION_REJECTED: "Rejected application",
  RECOGNITION_CONFERRED: "Conferred recognition",
  RENEWAL_STARTED: "Started renewal",
  DEADLINE_CREATED: "Created deadline",
  DEADLINE_UPDATED: "Updated deadline",
  DEADLINE_DEACTIVATED: "Deactivated deadline",
  DATA_EXPORTED: "Exported data (CSV)",
  ACTIVITY_CREATED: "Created activity proposal",
  ACTIVITY_UPDATED: "Updated activity proposal",
  ACTIVITY_SUBMITTED: "Submitted activity proposal",
  ACTIVITY_ENDORSED: "Endorsed activity proposal",
  ACTIVITY_RETURNED: "Returned activity proposal",
  ACTIVITY_APPROVED: "Approved activity proposal",
  ACTIVITY_REJECTED: "Rejected activity proposal",
  ACTIVITY_COMPLETED: "Marked activity completed",
  REPORT_CREATED: "Created accomplishment report",
  REPORT_UPDATED: "Updated accomplishment report",
  REPORT_SUBMITTED: "Submitted accomplishment report",
  REPORT_ACCEPTED: "Accepted accomplishment report",
  REPORT_RETURNED: "Returned accomplishment report",
  ATTACHMENT_UPLOADED: "Uploaded attachment",
  ATTACHMENT_DELETED: "Deleted attachment",
  ATTENDANCE_MARKED: "Marked attendance",
  ATTENDANCE_CHECKIN: "QR check-in",
  CHECKIN_OPENED: "Opened check-in",
  CHECKIN_CLOSED: "Closed check-in",
};

// ---------------------------------------------------------------------------
// Attendance (§Part 6)
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUS_META: Record<string, StatusMeta> = {
  PRESENT: { label: "Present", tone: "success" },
  LATE: { label: "Late", tone: "warning" },
  ABSENT: { label: "Absent", tone: "danger" },
  EXCUSED: { label: "Excused", tone: "info" },
};
