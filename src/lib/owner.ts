import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

let cached: string | null = env.OWNER_USER_ID ?? null;

/**
 * The single owner user's id. Prefers OWNER_USER_ID (set once — the id is
 * stable); falls back to an auth.users lookup by ALLOWED_EMAILS and caches it.
 * Used by cron jobs, which have no session.
 */
export async function getOwnerUserId(): Promise<string> {
  if (cached) return cached;

  const email = env.ALLOWED_EMAILS.split(",")[0]?.trim().toLowerCase();
  const rows = (await db.execute(
    sql`select id from auth.users where lower(email) = ${email} limit 1`,
  )) as unknown as { id: string }[];
  const id = rows[0]?.id;
  if (!id) throw new Error(`No auth.users row for owner email "${email}".`);

  cached = id;
  return id;
}
