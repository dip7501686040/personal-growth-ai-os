/**
 * Sets (or resets) the owner account's password so you can sign in without a
 * magic link.
 *
 *   NEW_PASSWORD='your-strong-password' pnpm set-password
 *
 * Uses the Supabase service-role key (server-only) via the admin API.
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.NEW_PASSWORD || process.argv[2];
  const ownerId = process.env.OWNER_USER_ID;
  const ownerEmail = (process.env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim();

  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.");
  }
  if (!password || password.length < 8) {
    throw new Error(
      "Set NEW_PASSWORD (>= 8 chars): NEW_PASSWORD='…' pnpm set-password",
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId = ownerId;
  if (!userId) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === ownerEmail.toLowerCase(),
    );
    if (!found) throw new Error(`No auth user for ${ownerEmail}`);
    userId = found.id;
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (error) throw error;

  console.log(`Password set for user ${userId}. You can now sign in with email + password.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
