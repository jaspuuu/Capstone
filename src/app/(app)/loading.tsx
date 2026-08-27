/**
 * Route-segment loading fallback (§26): the shell (sidebar + topbar) stays
 * rendered by the (app) layout; only the content area shows a page skeleton
 * while the server components stream their data.
 */
export default function AppLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading page"
      className="space-y-6"
    >
      <p className="sr-only">Loading…</p>

      {/* Page header placeholder */}
      <div className="space-y-3">
        <div className="h-7 w-56 max-w-full animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-surface-secondary" />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-line bg-surface"
          />
        ))}
      </div>

      {/* Main content blocks */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="h-96 animate-pulse rounded-xl border border-line bg-surface xl:col-span-2" />
        <div className="space-y-6">
          <div className="h-56 animate-pulse rounded-xl border border-line bg-surface" />
          <div className="h-40 animate-pulse rounded-xl border border-line bg-surface" />
        </div>
      </div>
    </div>
  );
}