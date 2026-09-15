"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { openNotification } from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";

/**
 * Client click-target for a notification: calls the server action (which
 * marks the row read under ownership) and navigates to the target in-place.
 * Only rendered for rows that carry a link.
 */
export function OpenNotificationLink({
  id,
  href,
  className,
  children,
}: {
  id: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const navigated = useRef(false);

  async function handleClick() {
    if (navigated.current) return;
    navigated.current = true;
    setPending(true);
    const result = await openNotification(emptyForm(id));
    router.push((result as { link?: string }).link ?? href);
  }

  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        void handleClick();
      }}
      aria-busy={pending}
      className={cn(className)}
      tabIndex={0}
    >
      {children}
    </a>
  );
}

function emptyForm(id: string): FormData {
  const f = new FormData();
  f.set("id", id);
  return f;
}