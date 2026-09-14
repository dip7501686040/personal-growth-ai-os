"use server";

import { revalidatePath } from "next/cache";
import { isDemoUserId } from "@/lib/demo";
import { requireUserId } from "@/lib/user";
import { resetDemoData } from "@/modules/demo/reset";

export type ActionState = { ok: boolean; message: string } | null;

/** Manual "reset now" for the demo account — same reset the daily cron and
 *  logout already trigger, just on demand so a demo session doesn't have to
 *  sign out and back in to get a clean slate. Refuses for the real owner. */
export async function resetDemoDataAction(): Promise<ActionState> {
  const userId = await requireUserId();
  if (!(await isDemoUserId(userId))) {
    return { ok: false, message: "Not available — this only resets the demo account." };
  }
  await resetDemoData(userId);
  revalidatePath("/", "layout");
  return { ok: true, message: "Demo data reset." };
}
