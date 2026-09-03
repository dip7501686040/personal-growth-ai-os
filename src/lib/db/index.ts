import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Drizzle client backed by postgres.js, pointed at the Supabase connection
 * pooler via `DATABASE_URL`. Use the **session** pooler (port 5432) in every
 * environment: this app's concurrency is tiny, so transaction-mode
 * multiplexing (port 6543) buys nothing and its cold-start behavior is worse
 * — a query issued while a suspended free-tier project wakes is held for the
 * full 2-minute `statement_timeout` before erroring. `prepare: false` is kept
 * so switching back to the transaction pooler stays a config-only change.
 * A single client is cached across hot reloads in dev.
 */
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__pgClient ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: 1,
    // A free-tier Supabase project pauses after inactivity; without this the
    // singleton keeps a dead socket and every later query hangs behind it.
    // Recycle idle/old connections so the next query dials a fresh one.
    idle_timeout: 20,
    max_lifetime: 60 * 20,
    connect_timeout: 15,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pgClient = client;
}

export const db = drizzle(client, { schema });

/**
 * Pings the DB until it answers, or throws after `deadlineMs`. A suspended
 * free-tier Supabase project takes ~30–40s to wake, and a query sent through
 * the pooler while it's still down is held for the full 2-minute
 * `statement_timeout` before erroring — so we can't just `await` a ping.
 *
 * Each attempt uses a fresh single-use connection and races a short
 * client-side timeout: if one ping hangs we abandon it and the next attempt
 * dials again rather than queueing behind it. The instant the compute is up,
 * a ping returns in ~400ms and we return. Call this before anything that must
 * hit the DB on a cold path (agent runs, cron handlers).
 */
export async function warmupDb(deadlineMs = 90_000): Promise<void> {
  const startedAt = Date.now();
  let lastErr: unknown = null;

  while (Date.now() - startedAt < deadlineMs) {
    const probe = postgres(env.DATABASE_URL, {
      prepare: false,
      max: 1,
      connect_timeout: 6,
      idle_timeout: 2,
    });
    try {
      await Promise.race([
        probe`select 1`,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("db ping timed out")), 6_000),
        ),
      ]);
      return;
    } catch (err) {
      lastErr = err;
    } finally {
      void probe.end({ timeout: 1 }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error("Database did not wake up within 90s");
}
