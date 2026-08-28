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
  | "deadlines"
  | "forms"
  | "analytics"
  | "users"
  | "colleges"
  | "audit";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  permission: Permission;
};

export type NavSection = {
  heading: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    heading: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", permission: "org.view" },
      { href: "/monitoring", label: "Activity Monitoring", icon: "monitoring", permission: "org.view" },
      { href: "/analytics", label: "Analytics", icon: "analytics", permission: "org.view" },
    ],
  },
  {
    heading: "Management",
    items: [
      { href: "/organizations", label: "Organizations", icon: "organizations", permission: "org.view" },
      {
        href: "/recognition",
        label: "Recognition & Renewal",
        icon: "recognition",
        permission: "recognition.view",
      },
      { href: "/activities", label: "Activity Proposals", icon: "activities", permission: "org.view" },
      { href: "/calendar", label: "Activity Calendar", icon: "calendar", permission: "org.view" },
      { href: "/reports", label: "Accomplishment Reports", icon: "reports", permission: "org.view" },
      { href: "/deadlines", label: "Deadlines", icon: "deadlines", permission: "deadline.view" },
      { href: "/forms", label: "Form Library", icon: "forms", permission: "org.view" },
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
