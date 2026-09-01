"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

const schema = z.object({ email: z.email("Enter a valid email address.") });

export type LoginState = { ok: boolean; message: string } | null;

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${env.APP_URL}/auth/callback` },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: `Sign-in link sent to ${parsed.data.email}. Check your inbox.`,
  };
}
