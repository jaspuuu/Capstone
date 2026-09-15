"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Layers } from "lucide-react";
import { setSelectedOrg, clearSelectedOrg } from "@/lib/actions/org-ctx";
import { cn } from "@/lib/utils";
import { MEMBER_POSITION_LABELS } from "@/lib/constants";

export type OrgSwitcherOption = {
  organizationId: string;
  name: string;
  acronym?: string | null;
  position?: string | null;
};

/**
 * Organization switcher in the topbar (beside the AY picker). Picking an
 * organization scopes the workspace (e.g. the officer dashboard) to it;
 * "All organizations" clears the cookie so the dashboard returns to every
 * organization the user belongs to.
 */
export function OrgSwitcher({
  memberships,
  selectedOrgId,
}: {
  memberships: OrgSwitcherOption[];
  selectedOrgId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current =
    memberships.find((m) => m.organizationId === selectedOrgId) ?? null;

  function pick(organizationId: string | null) {
    setOpen(false);
    if (organizationId === (current?.organizationId ?? null)) return;
    startTransition(async () => {
      if (organizationId) await setSelectedOrg(organizationId);
      else await clearSelectedOrg();
      router.refresh();
    });
  }

  if (memberships.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          current
            ? `Workspace: ${current.name}. Change organization`
            : "Workspace: all my organizations. Change organization"
        }
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-xs font-semibold text-content transition-colors hover:border-primary hover:bg-primary-light/50",
          pending && "opacity-60"
        )}
      >
        <Building2 className="size-4 text-content-secondary" aria-hidden />
        <span className="hidden max-w-[180px] truncate md:inline">
          {current ? current.name : "All organizations"}
        </span>
        <span className="md:hidden">{current?.acronym ?? "All"}</span>
        <ChevronDown className="size-3.5 text-content-secondary" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Organization workspace"
          className="absolute top-11 right-0 z-50 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        >
          <p className="border-b border-line px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-content-muted">
            My organizations ({memberships.length})
          </p>
          <ul className="max-h-[60vh] overflow-y-auto">
            <li>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={current === null}
                onClick={() => pick(null)}
                className={cn(
                  "flex w-full items-center gap-2.5 border-b border-line px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-surface-secondary",
                  current === null ? "text-primary" : "text-content"
                )}
              >
                <Layers className="size-4 shrink-0 text-content-secondary" aria-hidden />
                <span className="flex-1">
                  <span className="block truncate font-semibold">All organizations</span>
                  <span className="block text-xs text-content-muted">Everything you belong to</span>
                </span>
                {current === null && <Check className="size-4" aria-hidden />}
              </button>
            </li>
            {memberships.map((m) => {
              const active = current?.organizationId === m.organizationId;
              return (
                <li key={m.organizationId}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => pick(m.organizationId)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-surface-secondary",
                      active ? "text-primary" : "text-content"
                    )}
                  >
                    <Building2 className="size-4 shrink-0 text-content-secondary" aria-hidden />
                    <span className="flex-1">
                      <span className="block truncate font-semibold">{m.name}</span>
                      {m.position && (
                        <span className="block text-xs text-content-muted">
                          {MEMBER_POSITION_LABELS[m.position as keyof typeof MEMBER_POSITION_LABELS] ??
                            m.position}
                        </span>
                      )}
                    </span>
                    {active && <Check className="size-4" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}