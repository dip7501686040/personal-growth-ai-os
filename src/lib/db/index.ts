import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Drizzle client backed by postgres.js, pointed at the Supabase connection
 * pooler (transaction mode, port 6543). `prepare: false` is required for the
 * transaction pooler. A single client is cached across hot reloads in dev.
 */
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__pgClient ??
  postgres(env.DATABASE_URL, { prepare: false, max: 1 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pgClient = client;
}

export const db = drizzle(client, { schema });

/**
 * Pings the DB with a few retries. A free-tier Supabase project pauses after
 * inactivity and the first connection after wake can be slow enough to trip
 * `statement_timeout`; retrying gets past it. Call this at the top of cron
 * handlers (which always hit a cold connection).
 */
export async function warmupDb(attempts = 4): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await client`select 1`;
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}
