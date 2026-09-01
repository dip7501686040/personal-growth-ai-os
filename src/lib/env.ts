import { z } from "zod";

/**
 * Server-side environment validation. Import this only from server code
 * (Server Components, Route Handlers, Server Actions, proxy, scripts).
 * Never import from a "use client" module.
 */

/**
 * Public base URL of the app, used to build the magic-link redirect.
 * Precedence: explicit APP_URL → Vercel production domain → per-deployment
 * Vercel URL → localhost. Empty strings are treated as unset.
 */
function resolveAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Postgres connection string used by Drizzle (Supabase pooler, port 6543).
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url(),
  // Comma-separated list of emails permitted to sign in (single-user app).
  ALLOWED_EMAILS: z.string().min(1),
});

const parsed = serverEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  APP_URL: resolveAppUrl(),
  ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
});

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

/** Normalized set of emails allowed to sign in. */
export const allowedEmails: ReadonlySet<string> = new Set(
  env.ALLOWED_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function isAllowedEmail(email: string): boolean {
  return allowedEmails.has(email.trim().toLowerCase());
}
