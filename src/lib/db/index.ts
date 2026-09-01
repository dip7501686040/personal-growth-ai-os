import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Drizzle client backed by postgres.js, pointed at the Supabase connection
 * pooler (transaction mode, port 6543). `prepare: false` is required for the
 * transaction pooler.
 *
 * A single client is cached across hot reloads in development.
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
