"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/user";
import { SELECTABLE_MODELS } from "@/lib/llm/models";
import { choiceKey, setPreferredModel } from "@/modules/settings/service";

export type ActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

const DEFAULT = "default";

export async function setPreferredModelAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const raw = String(fd.get("model") ?? "");

  if (raw === DEFAULT) {
    await setPreferredModel(userId, null);
    revalidatePath("/settings");
    return { ok: true, message: "Reverted to the automatic model ladder." };
  }

  const match = SELECTABLE_MODELS.find((m) => choiceKey(m.choice) === raw);
  if (!match) {
    return { ok: false, message: "Unknown model." };
  }

  await setPreferredModel(userId, match.choice);
  revalidatePath("/settings");
  return {
    ok: true,
    message: `Every agent will now use ${match.label} first (with the existing chain as fallback).`,
  };
}
