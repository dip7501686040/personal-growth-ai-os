import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role Supabase client — bypasses RLS, can manage auth.users directly
 * (`admin.auth.admin.*`). Server-only; never import from a "use client"
 * module. Used to provision/reset the demo account (see scripts/seed-demo.ts
 * and scripts/provision-demo.ts) — the same pattern already used ad hoc in
 * scripts/set-password.ts, centralized here for reuse from app runtime code
 * (the demo-reset cron job) as well as one-off scripts.
 */
export function createAdminClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
