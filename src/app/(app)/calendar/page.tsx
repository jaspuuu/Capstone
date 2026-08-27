import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { scopedOrgWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Activity Calendar" };

type Search = { view?: string; date?: string; org?: string; q?: string };

function parseAnchor(s?: string): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
/** Week starts Monday (PH convention). */
function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7;
  return addDays(s, -dow);
}
function fmtISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true });
}

// ---------------------------------------------------------------------------
// Status chips
// ---------------------------------------------------------------------------

const DOT: Record<string, string> = {
  SUBMITTED: "bg-info",
  ENDORSED: "bg-gold",
  APPROVED: "bg-success",
  COMPLETED: "bg-content-muted",
  RETURNED: "bg-warning",
};
const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Pending",
  ENDORSED: "Endorsed",
  APPROVED: "Approved",
  COMPLETED: "Completed",
  RETURNED: "Returned",
};

type CalEvent = {
  id: string;
  title: string;
  orgLabel: string;
  venue: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "week" || sp.view === "day" ? sp.view : "month";
  const anchor = parseAnchor(sp.date);

  // Range covered by the current view.
  let rangeStart: Date;
  let rangeEnd: Date;
  let days: Date[];
  if (view === "month") {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const gridEnd = addDays(startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)), 7);
    rangeStart = gridStart;
    rangeEnd = gridEnd;
    days = [];
    for (let d = gridStart; d < gridEnd; d = addDays(d, 1)) days.push(d);
  } else if (view === "week") {
    rangeStart = startOfWeek(anchor);
    rangeEnd = addDays(rangeStart, 7);
    days = [];
    for (let d = rangeStart; d < rangeEnd; d = addDays(d, 1)) days.push(d);
  } else {
    rangeStart = startOfDay(anchor);
    rangeEnd = addDays(rangeStart, 1);
    days = [rangeStart];
  }

  const orgScope = scopedOrgWhere(user);
  const events = await db.activityProposal.findMany({
    where: {
      organization: orgScope,
      // Drafts stay private to the owning organization's officers; rejected
      // proposals do not reserve space.
      status: { notIn: ["DRAFT", "REJECTED"] },
      ...(sp.org ? { organizationId: sp.org } : {}),
      ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" as const } } : {}),
      startAt: { lt: rangeEnd },
      endAt: { gte: rangeStart },
    },
    include: { organization: { select: { acronym: true, name: true } } },
    orderBy: { startAt: "asc" },
  });

  const calEvents: CalEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    orgLabel: e.organization.acronym ?? e.organization.name,
    venue: e.venue,
    startAt: e.startAt,
    endAt: e.endAt,
    status: e.status,
  }));

  // ---- Conflict detection -------------------------------------------------
  // Two pending/approved activities that overlap in time are flagged when they
  // share a venue (double booking) or belong to the same organization.
  const conflicts: { a: CalEvent; b: CalEvent; kind: "venue" | "organization" }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < calEvents.length; i++) {
    for (let j = i + 1; j < calEvents.length; j++) {
      const a = calEvents[i];
      const b = calEvents[j];
      if (!(a.startAt < b.endAt && b.startAt < a.endAt)) continue;
      const sameVenue =
        a.venue && b.venue && a.venue.trim().toLowerCase() === b.venue.trim().toLowerCase();
      const sameOrg = a.orgLabel === b.orgLabel;
      if (!sameVenue && !sameOrg) continue;
      const key = `${a.id}|${b.id}|${sameVenue ? "venue" : "org"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push({ a, b, kind: sameVenue ? "venue" : "organization" });
    }
  }
  const conflictedIds = new Set(conflicts.flatMap((c) => [c.a.id, c.b.id]));

  // ---- Org filter options -------------------------------------------------
  const orgOptions = await db.organization.findMany({
    where: orgScope,
    select: { id: true, name: true, acronym: true },
    orderBy: [{ collegeId: "asc" }, { name: "asc" }],
  });

  // ---- Navigation URLs ----------------------------------------------------
  const qs = (params: Record<string, string | undefined>): string => {
    const p = new URLSearchParams();
    if (params.view && params.view !== "month") p.set("view", params.view);
    if (params.date) p.set("date", params.date);
    if (params.org) p.set("org", params.org);
    if (params.q) p.set("q", params.q);
    const s = p.toString();
    return `/calendar${s ? `?${s}` : ""}`;
  };
  const shift = (dir: number): string => {
    const next =
      view === "month"
        ? new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1)
        : addDays(anchor, dir * (view === "week" ? 7 : 1));
    return qs({ ...sp, date: fmtISO(next) });
  };
  const setView = (v: string) => qs({ ...sp, view: v, date: fmtISO(anchor) });

  const rangeLabel =
    view === "month"
      ? anchor.toLocaleDateString("en-PH", { month: "long", year: "numeric" })
      : view === "week"
        ? `${rangeStart.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${addDays(rangeEnd, -1).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`
        : rangeStart.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const eventsOn = (day: Date) =>
    calEvents.filter((e) => e.startAt < addDays(day, 1) && e.endAt >= day);

  const today = fmtISO(new Date());

  return (
    <>
      <PageHeader
        title="Activity Calendar"
        description="Scheduled activities across your scope. Conflicting bookings are flagged automatically."
      />

      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={shift(-1)}
            aria-label="Previous"
            className="flex size-10 items-center justify-center rounded-lg border border-line-strong text-content-secondary hover:border-primary hover:text-primary"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <Link
            href={qs({ ...sp, date: fmtISO(new Date()) })}
            className="h-10 rounded-lg border border-line-strong px-3 text-sm font-semibold leading-10 text-content hover:border-primary hover:text-primary"
          >
            Today
          </Link>
          <Link
            href={shift(1)}
            aria-label="Next"
            className="flex size-10 items-center justify-center rounded-lg border border-line-strong text-content-secondary hover:border-primary hover:text-primary"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          <p className="ml-2 font-display text-lg font-bold text-content">{rangeLabel}</p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line-strong">
            {["month", "week", "day"].map((v) => (
              <Link
                key={v}
                href={setView(v)}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wide capitalize ${
                  view === v ? "bg-primary text-white" : "text-content-secondary hover:bg-surface-secondary"
                }`}
              >
                {v}
              </Link>
            ))}
          </div>
          <form action="/calendar" className="flex items-end gap-2">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="date" value={fmtISO(anchor)} />
            <select
              name="org"
              defaultValue={sp.org ?? ""}
              aria-label="Filter by organization"
              className="h-10 max-w-44 rounded-lg border border-line-strong bg-surface px-2 text-sm shadow-sm"
            >
              <option value="">All organizations</option>
              {orgOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.acronym ?? o.name}
                </option>
              ))}
            </select>
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search…"
              aria-label="Search activities"
              className="h-10 w-36 rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm"
            />
            <button type="submit" className="h-10 rounded-lg bg-primary-dark px-3 text-sm font-semibold text-white hover:bg-primary">
              Apply
            </button>
          </form>
        </div>
      </div>

      {conflicts.length > 0 && (
        <Alert tone="warning" title={`${conflicts.length} scheduling conflict${conflicts.length > 1 ? "s" : ""} detected`} className="mb-5">
          <ul className="list-inside list-disc space-y-0.5">
            {conflicts.slice(0, 4).map((c) => (
              <li key={`${c.a.id}-${c.b.id}-${c.kind}`}>
                <span className="font-semibold">{c.kind === "venue" ? `Venue “${c.a.venue}”` : c.a.orgLabel}</span>
                :{" "}
                <Link href={`/activities/${c.a.id}`} className="underline">{c.a.title}</Link>
                {" ↔ "}
                <Link href={`/activities/${c.b.id}`} className="underline">{c.b.title}</Link>
              </li>
            ))}
            {conflicts.length > 4 && <li>and {conflicts.length - 4} more…</li>}
          </ul>
        </Alert>
      )}

      {/* Views */}
      {view === "month" && (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b border-line bg-surface-secondary/60">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="px-2 py-2 text-center text-[11px] font-bold tracking-wide text-content-secondary uppercase">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const inMonth = day.getMonth() === anchor.getMonth();
                const dayEvents = eventsOn(day);
                const shown = dayEvents.slice(0, 3);
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-24 border-r border-b border-line p-1.5 last:border-r-0 ${
                      inMonth ? "" : "bg-surface-secondary/40"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between px-0.5">
                      <span
                        className={`text-xs font-semibold ${
                          fmtISO(day) === today
                            ? "flex size-5 items-center justify-center rounded-full bg-primary font-bold text-white"
                            : inMonth
                              ? "text-content"
                              : "text-content-muted"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {dayEvents.some((e) => conflictedIds.has(e.id)) && (
                        <TriangleAlert className="size-3 text-warning" aria-label="Conflict" />
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {shown.map((e) => (
                        <Link
                          key={e.id}
                          href={`/activities/${e.id}`}
                          className="block rounded px-1 py-0.5 text-[11px] leading-tight text-content hover:bg-primary-light"
                        >
                          <span className="flex items-center gap-1">
                            <span className={`size-1.5 shrink-0 rounded-full ${DOT[e.status] ?? "bg-content-muted"}`} aria-hidden />
                            <span className="truncate">
                              {e.orgLabel} · {e.title}
                            </span>
                          </span>
                          <span className="block truncate pl-2.5 text-[10px] text-content-secondary">
                            {fmtTime(e.startAt)} – {fmtTime(e.endAt)}
                            {e.venue ? ` · ${e.venue}` : ""}
                          </span>
                        </Link>
                      ))}
                      {dayEvents.length > 3 && (
                        <Link
                          href={`/calendar?view=day&date=${fmtISO(day)}${sp.org ? `&org=${sp.org}` : ""}`}
                          className="block px-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                          +{dayEvents.length - 3} more
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {view === "week" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
          {days.map((day) => {
            const dayEvents = eventsOn(day);
            return (
              <Card key={day.toISOString()} className="p-0">
                <div className={`border-b border-line px-3 py-2 ${fmtISO(day) === today ? "bg-primary-light" : "bg-surface-secondary/60"}`}>
                  <p className="text-[11px] font-bold tracking-wide text-content-secondary uppercase">
                    {day.toLocaleDateString("en-PH", { weekday: "short" })}
                  </p>
                  <p className="font-display text-sm font-bold text-content">{day.getDate()}</p>
                </div>
                <div className="space-y-1.5 p-2">
                  {dayEvents.length === 0 && <p className="px-1 text-xs text-content-muted">—</p>}
                  {dayEvents.map((e) => (
                    <EventChip key={e.id} event={e} conflict={conflictedIds.has(e.id)} />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {view === "day" && (
        <Card>
          <CardContent className="space-y-3 p-4">
            {calEvents.length === 0 && (
              <EmptyDay />
            )}
            {calEvents.map((e) => (
              <div key={e.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`size-2 shrink-0 rounded-full ${DOT[e.status] ?? "bg-content-muted"}`} aria-hidden />
                  <Link href={`/activities/${e.id}`} className="font-display text-sm font-bold text-content hover:text-primary">
                    {e.title}
                  </Link>
                  <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] font-semibold text-content-secondary">
                    {STATUS_LABEL[e.status] ?? e.status}
                  </span>
                  {conflictedIds.has(e.id) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-light px-2 py-0.5 text-[11px] font-semibold text-warning">
                      <TriangleAlert className="size-3" aria-hidden /> Conflict
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-content-secondary">
                  {fmtTime(e.startAt)} – {fmtTime(e.endAt)} · {e.orgLabel}
                  {e.venue ? ` · ${e.venue}` : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-content-muted">
        <CalendarDays className="size-3.5" aria-hidden />
        Draft and rejected proposals are not shown on the calendar.
      </p>
    </>
  );
}

function EventChip({ event: e, conflict }: { event: CalEvent; conflict: boolean }) {
  return (
    <Link
      href={`/activities/${e.id}`}
      className="block rounded-lg border border-line px-2 py-1.5 hover:border-primary"
    >
      <span className="flex items-center gap-1">
        <span className={`size-1.5 shrink-0 rounded-full ${DOT[e.status] ?? "bg-content-muted"}`} aria-hidden />
        <span className="truncate text-[11px] font-semibold text-content">{e.title}</span>
        {conflict && <TriangleAlert className="size-3 shrink-0 text-warning" aria-hidden />}
      </span>
      <span className="mt-0.5 block truncate text-[10px] text-content-secondary">
        {fmtTime(e.startAt)} – {fmtTime(e.endAt)}
        {e.venue ? ` · ${e.venue}` : ""}
      </span>
    </Link>
  );
}

function EmptyDay() {
  return (
    <p className="py-8 text-center text-sm text-content-muted">
      No activities scheduled for this day.
    </p>
  );
}
