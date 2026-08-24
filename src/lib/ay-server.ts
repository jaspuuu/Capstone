import { cookies } from "next/headers";
import { AY_COOKIE, isValidAy } from "@/lib/ay";
import { currentAcademicYear } from "@/lib/utils";

/** Server-only: the academic year the topbar picker selected, or the current one. */
export async function getSelectedAy(): Promise<string> {
  const value = (await cookies()).get(AY_COOKIE)?.value;
  return isValidAy(value) ? value! : currentAcademicYear();
}
