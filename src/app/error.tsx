"use client";

import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-danger-light text-danger">
        <AlertTriangle className="size-7" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-xl font-bold text-content">Something went wrong</h1>
      <p className="mt-1 max-w-md text-sm text-content-secondary">
        An unexpected error occurred while loading this page. Please try again.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-content-muted">Reference: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={retry}
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
      >
        Try again
      </button>
    </div>
  );
}
