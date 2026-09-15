import type { Permission } from "@/lib/auth/rbac";

// Icon names are resolved to components inside the client shell — component
// references cannot cross the server/client boundary.
export type NavIcon =
  | "dashboard"
  | "organizations"
  | "recognition"
  | "activities"
  | "calendar"
  | "reports"
  | "monitoring"
  | "wallet"
  | "deadlines"
  | "forms"
  | "analytics"
  | "users"
  | "colleges"
  | "audit"
  | "signatures"
  | "attendance";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  permission: Permission;
  /** Label override for organization-facing (non-office) roles. */
  orgLabel?: string;
};

export type NavSection = {
  heading: string;
  items: NavItem[];
};

// Grouped navigation. Headings mirror the workspace hierarchy (Overview /
// Organizations / Activities / Reports / Administration) instead of a flat
// ten-item list, so the system reads as a workflow rather than an admin
// console. Office-only items (Signature Queue) stay gated by permission.
export const NAV_SECTIONS: NavSection[] = [
  {
    heading: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", permission: "org.view" },
      { href: "/signatures", label: "Signature Queue", icon: "signatures", permission: "org.manage" },
      { href: "/forms", label: "Form Library", icon: "forms", permission: "org.view" },
    ],
  },
  {
    heading: "Organizations",
    items: [
      { href: "/organizations", label: "Organizations", icon: "organizations", permission: "org.view" },
      {
        href: "/recognition",
        label: "Recognition & Renewal",
        icon: "recognition",
        permission: "recognition.view",
      },
      { href: "/deadlines", label: "Deadlines", icon: "deadlines", permission: "deadline.view" },
    ],
  },
  {
    heading: "Activities",
    items: [
      { href: "/activities", label: "Activity Proposals", icon: "activities", permission: "org.view", orgLabel: "Activities" },
      { href: "/calendar", label: "Activity Calendar", icon: "calendar", permission: "org.view" },
      { href: "/monitoring", label: "Activity Monitoring", icon: "monitoring", permission: "org.view", orgLabel: "Monitored Activities" },
      { href: "/reports", label: "Accomplishment Reports", icon: "reports", permission: "org.view" },
    ],
  },
  {
    heading: "Reports",
    items: [
      { href: "/analytics", label: "Analytics", icon: "analytics", permission: "org.view" },
      { href: "/financial", label: "Financial", icon: "wallet", permission: "org.view" },
    ],
  },
  {
    heading: "Administration",
    items: [
      { href: "/users", label: "User Accounts", icon: "users", permission: "users.manage" },
      { href: "/colleges", label: "Colleges", icon: "colleges", permission: "college.manage" },
      { href: "/audit-log", label: "Audit Log", icon: "audit", permission: "audit.view" },
    ],
  },
];

// Curated sidebar for plain members: the student's self-service surface only.
// Office-oriented items (Signature Queue, Form Library, Recognition renewal,
// monitoring, reports, finances, analytics) stay reachable by permission but
// are removed from the member's navigation so the sidebar reads as
// "My dashboard — find something, go somewhere, show up".
export const MEMBER_SECTIONS: NavSection[] = [
  {
    heading: "Overview",
    items: [
      { href: "/dashboard", label: "My Dashboard", icon: "dashboard", permission: "org.view" },
    ],
  },
  {
    heading: "Participation",
    items: [
      { href: "/organizations", label: "Find Organizations", icon: "organizations", permission: "org.view" },
      { href: "/calendar", label: "Upcoming Activities", icon: "calendar", permission: "org.view" },
      { href: "/my/attendance", label: "My Attendance", icon: "attendance", permission: "org.view" },
    ],
  },
];