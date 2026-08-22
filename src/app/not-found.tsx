import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-light text-primary">
        <Compass className="size-7" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-xl font-bold text-content">Page not found</h1>
      <p className="mt-1 max-w-md text-sm text-content-secondary">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
