import { cookies } from "next/headers";
import { ORG_COOKIE } from "@/lib/org-ctx";

/** Server-only: the org the user selected in the topbar switcher, or null. */
export async function getSelectedOrgId(): Promise<string | null> {
  const value = (await cookies()).get(ORG_COOKIE)?.value;
  return value && value.length > 0 ? value : null;
}