import { z } from "zod";

/**
 * Server-side environment validation. Import this only from server code
 * (Server Components, Route Handlers, Server Actions, proxy, scripts).
 * Never import from a "use client" module.
 */
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Postgres connection string used by Drizzle (Supabase pooler, port 6543).
  DATABASE_URL: z.string().min(1),
  // Direct connection (port 5432) used for migrations only.
  DIRECT_URL: z.string().min(1).optional(),
  APP_URL: z.url().default("http://localhost:3000"),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid or missing environment variables:\n${issues}\n\n` +
      `Copy .env.example to .env.local and fill in the values.`,
  );
}

export const env = parsed.data;
