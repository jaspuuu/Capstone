"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ORG_COOKIE } from "@/lib/org-ctx";

/** Persist the topbar organization selection; the switcher refreshes after. */
export async function setSelectedOrg(orgId: string): Promise<void> {
  if (!orgId) return;
  (await cookies()).set(ORG_COOKIE, orgId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return;
}

/** Back to "all my organizations" scoping. */
export async function clearSelectedOrg(): Promise<void> {
  (await cookies()).delete(ORG_COOKIE);
  revalidatePath("/", "layout");
  return;
}