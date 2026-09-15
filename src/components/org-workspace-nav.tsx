import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Award, CalendarDays, FileStack, GraduationCap, LayoutGrid, Users, Wallet } from "lucide-react";

export type OrgTabKey =
  | "overview"
  | "members"
  | "recognition"
  | "documents"
  | "activities"
  | "advisers"
  | "finance";

type OrgTabDef = {
  key: OrgTabKey;
  label: string;
  icon: LucideIcon;
  href: (orgId: string) => string;
  visibleToMembers: boolean;
};

const TABS: OrgTabDef[] = [
  {
    key: "overview",
    label: "Overview",
    icon: LayoutGrid,
    href: (orgId) => `/organizations/${orgId}`,
    visibleToMembers: true,
  },
  {
    key: "members",
    label: "Members",
    icon: Users,
    href: (orgId) => `/organizations/${orgId}?tab=members`,
    visibleToMembers: true,
  },
  {
    key: "recognition",
    label: "Recognition",
    icon: Award,
    href: (orgId) => `/organizations/${orgId}?tab=recognition`,
    visibleToMembers: true,
  },
  {
    key: "documents",
    label: "Documents",
    icon: FileStack,
    href: (orgId) => `/organizations/${orgId}/documents`,
    visibleToMembers: false,
  },
  {
    key: "activities",
    label: "Activities",
    icon: CalendarDays,
    href: (orgId) => `/organizations/${orgId}/monitoring`,
    visibleToMembers: false,
  },
  {
    key: "advisers",
    label: "Advisers",
    icon: GraduationCap,
    href: (orgId) => `/organizations/${orgId}?tab=advisers`,
    visibleToMembers: false,
  },
  {
    key: "finance",
    label: "Finance",
    icon: Wallet,
    href: (orgId) => `/organizations/${orgId}/financial`,
    visibleToMembers: false,
  },
];

export function OrgWorkspaceNav({
  orgId,
  active,
  member = false,
}: {
  orgId: string;
  active: OrgTabKey;
  member?: boolean;
}) {
  const tabs = TABS.filter((t) => !member || t.visibleToMembers);
  return (
    <nav
      aria-label="Organization workspace"
      className="mb-6 flex flex-wrap gap-1.5 overflow-x-auto rounded-xl border border-line bg-surface p-1.5"
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href(orgId)}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-primary text-white shadow-sm"
                : "text-content-secondary hover:bg-line/60 hover:text-content"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}