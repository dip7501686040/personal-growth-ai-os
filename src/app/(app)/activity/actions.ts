"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import {
  createIngestToken,
  revokeIngestToken,
} from "@/modules/activity/service";

export type TokenState =
  | { ok: true; message: string; token?: string }
  | { ok: false; message: string }
  | null;

export async function generateTokenAction(
  _p: TokenState,
  fd: FormData,
): Promise<TokenState> {
  const userId = await requireUserId();
  const label = z
    .string()
    .trim()
    .max(60)
    .default("collector")
    .parse(fd.get("label") || "collector");
  const { token } = await createIngestToken(userId, label);
  revalidatePath("/activity");
  return {
    ok: true,
    message: "Token created — copy it now, it won't be shown again.",
    token,
  };
}

export async function revokeTokenAction(
  _p: TokenState,
  fd: FormData,
): Promise<TokenState> {
  const userId = await requireUserId();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { ok: false, message: "Bad id." };
  await revokeIngestToken(userId, id.data);
  revalidatePath("/activity");
  return { ok: true, message: "Token revoked." };
}
