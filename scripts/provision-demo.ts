/**
 * One-off: creates the demo Supabase Auth user (DEMO_EMAIL / DEMO_PASSWORD
 * from .env.local) if it doesn't already exist. Run once, then run
 * `pnpm seed-demo` to populate its dummy data.
 *
 *   pnpm provision-demo
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

async function main() {
  if (!env.DEMO_EMAIL || !env.DEMO_PASSWORD) {
    throw new Error("Set DEMO_EMAIL and DEMO_PASSWORD in .env.local first.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;

  const existing = data.users.find(
    (u) => u.email?.toLowerCase() === env.DEMO_EMAIL!.toLowerCase(),
  );
  if (existing) {
    console.log(`Demo user already exists: ${existing.id}`);
    console.log(`Set DEMO_USER_ID=${existing.id} in .env.local to skip the lookup.`);
    return;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: env.DEMO_EMAIL,
    password: env.DEMO_PASSWORD,
    email_confirm: true,
  });
  if (createErr) throw createErr;

  console.log(`Demo user created: ${created.user.id}`);
  console.log(`Set DEMO_USER_ID=${created.user.id} in .env.local, then run: pnpm seed-demo`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
