"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env, isAllowedEmail } from "@/lib/env";

const schema = z.object({ email: z.email("Enter a valid email address.") });

export type LoginState = { ok: boolean; message: string } | null;

// Generic response used whether or not the email is allowed, so the form
// never reveals which addresses can sign in.
const SENT = {
  ok: true,
  message: "If that address can sign in, a magic link is on its way.",
} as const;

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid email." };
  }

  const email = parsed.data.email;

  // Single-user app: only allowlisted emails get a link, and we never create
  // a new user from the login form.
  if (!isAllowedEmail(email)) {
    return SENT;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${env.APP_URL}/auth/callback`,
      shouldCreateUser: false,
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return SENT;
}
