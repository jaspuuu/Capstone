"use client";

import { AlertTriangle } from "lucide-react";

/**
 * Segment error boundary (§26): keeps the app shell (sidebar + topbar)
 * rendered and shows an in-content error with retry, matching the loading
 * skeleton's behaviour. The global `/error.tsx` still catches root failures.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-72 max-w-md flex-col items-center justify-center text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-light text-danger">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-lg font-bold text-content">
        This page could not be loaded
      </h1>
      <p className="mt-1 text-sm text-content-secondary">
        An unexpected error occurred. Please try again.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-content-muted">Reference: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={retry}
        className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
      >
        Try again
      </button>
    </div>
  );
}