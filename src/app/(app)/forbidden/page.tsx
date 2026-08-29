import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Card } from "@/components/ui/card";
export const instant = false;

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md p-8 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-danger-light text-danger">
          <ShieldX className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-xl font-bold text-content">Access restricted</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Your role does not have permission to view this page. If you believe this is a mistake,
          contact the OSAS administrator.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          Back to dashboard
        </Link>
      </Card>
    </div>
  );
}
