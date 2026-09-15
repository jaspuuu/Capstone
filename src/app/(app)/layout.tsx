import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { can, isAdminRole } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { MEMBER_SECTIONS, NAV_SECTIONS } from "@/lib/nav";
import { getSelectedAy } from "@/lib/ay-server";
import { getSelectedOrgId } from "@/lib/org-server";
import { getNotificationCenter } from "@/lib/notification-center";
import { Shell } from "@/components/shell";
export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Admin-issued temporary passwords must be replaced before the system
  // can be used.
  if (user.mustChangePassword) redirect("/change-password");

  // Organization-facing roles see the workspace wording (Activities /
  // Monitored Activities) instead of the office's admin vocabulary.
  const orgFacing = !isAdminRole(user.role);

  const [nav, notificationCenter, selectedAy, memberships, selectedOrgId] = await Promise.all([
    Promise.resolve(
      (user.role === "MEMBER" ? MEMBER_SECTIONS : NAV_SECTIONS).map((section) => ({
        heading: section.heading,
        items: section.items
          .filter((item) => can(user, item.permission))
          .map((item) => ({
            href: item.href,
            label: orgFacing && item.orgLabel ? item.orgLabel : item.label,
            icon: item.icon,
            permission: item.permission,
          })),
      })).filter((section) => section.items.length > 0)
    ),
    getNotificationCenter(user.id),
    getSelectedAy(),
    db.organizationMember.findMany({
      where: { userId: user.id, isCurrent: true },
      select: {
        organizationId: true,
        position: true,
        organization: { select: { name: true, acronym: true } },
      },
      orderBy: [{ position: "asc" }, { organization: { name: "asc" } }],
    }),
    getSelectedOrgId(),
  ]);

  return (
    <Shell
      user={{
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isViewOnly: user.isViewOnly,
      }}
      nav={nav}
      unreadNotifications={notificationCenter.unread}
      notificationCenter={notificationCenter}
      selectedAy={selectedAy}
      memberships={memberships.map((m) => ({
        organizationId: m.organizationId,
        name: m.organization.name,
        acronym: m.organization.acronym,
        position: m.position,
      }))}
      selectedOrgId={selectedOrgId}
    >
      {children}
    </Shell>
  );
}