"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Menu, Search, ShieldCheck, UserRound, X, Activity, Award, CalendarClock, CalendarDays, CalendarPlus, ChartColumn, ClipboardCheck, Files, LayoutDashboard, Landmark, ScrollText, School, Users } from "lucide-react";
import type { NavIcon, NavSection } from "@/lib/nav";
import { logout } from "@/lib/actions/auth";
import { cn, initials } from "@/lib/utils";
import { SHORT_ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@/generated/prisma/client";

const NAV_ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  organizations: Landmark,
  recognition: Award,
  activities: CalendarPlus,
  calendar: CalendarDays,
  reports: ClipboardCheck,
  monitoring: Activity,
  deadlines: CalendarClock,
  forms: Files,
  analytics: ChartColumn,
  users: Users,
  colleges: School,
  audit: ScrollText,
};

type ShellUser = {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
  isViewOnly: boolean;
};

// localStorage-backed store so the collapse preference survives reloads
// without setState-in-effect cascades.
const SIDEBAR_KEY = "organize.sidebarCollapsed";
let sidebarListeners: Array<() => void> = [];

function subscribeSidebar(callback: () => void) {
  sidebarListeners.push(callback);
  return () => {
    sidebarListeners = sidebarListeners.filter((l) => l !== callback);
  };
}

function getSidebarCollapsed() {
  return window.localStorage.getItem(SIDEBAR_KEY) === "1";
}

function getServerSidebarCollapsed() {
  return false;
}

function setSidebarCollapsed(value: boolean) {
  window.localStorage.setItem(SIDEBAR_KEY, value ? "1" : "0");
  for (const listener of sidebarListeners) listener();
}

export function Shell({
  user,
  nav,
  unreadNotifications = 0,
  children,
}: {
  user: ShellUser;
  nav: NavSection[];
  unreadNotifications?: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, getSidebarCollapsed, getServerSidebarCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close overlays when a navigation link is clicked.
  function closeOverlays() {
    setMobileOpen(false);
    setMenuOpen(false);
  }

  // Dismiss the account menu on outside tap / Escape. pointerdown covers
  // touch screens too — mobile browsers often skip mousedown for taps
  // outside interactive elements, which used to leave the menu stuck open.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function toggleCollapsed() {
    setSidebarCollapsed(!collapsed);
  }

  return (
    <div className="flex min-h-dvh">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-primary-dark/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          collapsed ? "lg:w-[76px]" : "lg:w-64",
          "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Primary navigation"
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold font-display text-sm font-extrabold text-primary-dark">
            OR
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display text-base font-bold tracking-tight text-sidebar-text">
                ORGanIZE
              </p>
              <p className="truncate text-[11px] font-medium text-sidebar-text-muted">
                LSPU · OSAS
              </p>
            </div>
          )}
          <button
            type="button"
            className="ml-auto rounded-lg p-2 text-sidebar-text-secondary hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* Nav */}
        <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-4">
          {nav.map((section) => (
            <div key={section.heading} className="mb-5 last:mb-0">
              {!collapsed && (
                <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-widest text-sidebar-text-muted">
                  {section.heading}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = NAV_ICONS[item.icon];
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        onClick={closeOverlays}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-sidebar-active text-white shadow-inner"
                            : "text-sidebar-text-secondary hover:bg-sidebar-hover hover:text-white"
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-5 shrink-0",
                            active ? "text-gold" : "text-sidebar-text-muted group-hover:text-white"
                          )}
                          aria-hidden
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse toggle (desktop) */}
        <div className="hidden border-t border-white/10 p-3 lg:block">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-semibold text-sidebar-text-muted hover:bg-sidebar-hover hover:text-white"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelIcon collapsed={collapsed} />
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-lg p-2 text-content-secondary hover:bg-surface-secondary hover:text-content lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" aria-hidden />
          </button>

          <form action="/organizations" role="search" className="relative hidden max-w-md flex-1 sm:block">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-content-muted"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              placeholder="Search organizations…"
              aria-label="Search organizations"
              className="h-9 w-full rounded-lg border border-line bg-background pl-9 pr-3 text-sm text-content placeholder:text-content-muted focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </form>

          <div className="ml-auto flex items-center gap-2" ref={menuRef}>
            {user.isViewOnly && (
              <span className="hidden items-center gap-1 rounded-full border border-warning/25 bg-warning-light px-2.5 py-1 text-[11px] font-semibold text-warning md:inline-flex">
                <ShieldCheck className="size-3.5" aria-hidden />
                View-only access
              </span>
            )}
            <Link
              href="/notifications"
              onClick={closeOverlays}
              className="relative rounded-lg p-2 text-content-secondary transition-colors hover:bg-surface-secondary hover:text-content"
              aria-label={
                unreadNotifications > 0
                  ? `Notifications, ${unreadNotifications} unread`
                  : "Notifications"
              }
            >
              <Bell className="size-5" aria-hidden />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2.5 rounded-full border border-line bg-surface py-1 pr-3 pl-1 transition-colors hover:border-primary hover:bg-primary-light/50"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-primary font-display text-xs font-bold text-white">
                {initials(user)}
              </span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block max-w-[160px] truncate text-xs font-semibold text-content">
                  {user.firstName} {user.lastName}
                </span>
                <span className="block text-[11px] text-content-secondary">
                  {SHORT_ROLE_LABELS[user.role]}
                </span>
              </span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute top-14 right-4 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-pop sm:right-6"
              >
                <div className="border-b border-line px-4 py-3">
                  <p className="truncate text-sm font-semibold text-content">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="mt-0.5 text-xs text-content-secondary">
                    {SHORT_ROLE_LABELS[user.role]}
                  </p>
                </div>
                <Link
                  href="/profile"
                  role="menuitem"
                  onClick={closeOverlays}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-content hover:bg-surface-secondary"
                >
                  <UserRound className="size-4 text-content-secondary" aria-hidden />
                  My profile
                </Link>
                <form action={logout}>
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2.5 text-left text-sm font-medium text-danger hover:bg-danger-light"
                  >
                    <LogOut className="size-4" aria-hidden />
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="border-t border-line px-6 py-4 text-center text-xs text-content-muted">
          ORGanIZE · Office of Student Affairs and Services · Laguna State Polytechnic University
        </footer>
      </div>
    </div>
  );
}

function PanelIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
      aria-hidden
      style={{ transform: collapsed ? "scaleX(-1)" : undefined }}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}
