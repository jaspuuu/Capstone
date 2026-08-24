import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { NAV_SECTIONS } from "@/lib/nav";
import { getSelectedAy } from "@/lib/ay-server";
import { Shell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Admin-issued temporary passwords must be replaced before the system
  // can be used.
  if (user.mustChangePassword) redirect("/change-password");

  const [nav, unreadNotifications, selectedAy] = await Promise.all([
    Promise.resolve(
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => can(user, item.permission)),
      })).filter((section) => section.items.length > 0)
    ),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    getSelectedAy(),
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
      unreadNotifications={unreadNotifications}
      selectedAy={selectedAy}
    >
      {children}
    </Shell>
  );
}
