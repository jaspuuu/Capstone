"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { AY_COOKIE, isValidAy } from "@/lib/ay";

/** Persist the topbar year selection; the picker refreshes the tree after. */
export async function setSelectedAy(ay: string): Promise<void> {
  if (!isValidAy(ay)) return;
  (await cookies()).set(AY_COOKIE, ay, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return;
}

export async function clearSelectedAy(): Promise<void> {
  (await cookies()).delete(AY_COOKIE);
  revalidatePath("/", "layout");
  return;
}
