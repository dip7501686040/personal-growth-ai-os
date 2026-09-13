import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

let cached: string | null = env.DEMO_USER_ID ?? null;

/**
 * The demo account's user id, or null if no demo account is configured
 * (DEMO_EMAIL unset, or no matching auth.users row yet — e.g. before
 * scripts/provision-demo.ts has run). Mirrors getOwnerUserId()'s
 * cache-then-lookup shape. Used by the demo-reset cron job, which — like
 * every other cron handler — only gets the *owner's* id from the route, and
 * has to resolve the demo id itself.
 */
export async function getDemoUserId(): Promise<string | null> {
  if (cached) return cached;
  if (!env.DEMO_EMAIL) return null;

  const email = env.DEMO_EMAIL.trim().toLowerCase();
  const rows = (await db.execute(
    sql`select id from auth.users where lower(email) = ${email} limit 1`,
  )) as unknown as { id: string }[];
  const id = rows[0]?.id;
  if (!id) return null;

  cached = id;
  return id;
}

/** True when `userId` is the demo account's id. Used to switch a handful of
 *  page-level behaviors (the demo banner, the Gmail-drafts placeholder) —
 *  never used for write permission, since the demo account can write freely
 *  to its own rows exactly like any other real account. */
export async function isDemoUserId(userId: string): Promise<boolean> {
  const demoId = await getDemoUserId();
  return demoId != null && userId === demoId;
}
