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
  // Postgres connection string used by Drizzle. Point this at the Supabase
  // session pooler (port 5432) in every environment — see src/lib/db/index.ts.
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url(),
  // Comma-separated list of emails permitted to sign in (single-user app).
  ALLOWED_EMAILS: z.string().min(1),
  // AI providers — optional; agents degrade gracefully when a key is absent.
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Job-search sources (Track J) — all optional; the search skips a source
  // whose key is missing.
  JSEARCH_API_KEY: z.string().min(1).optional(),
  ADZUNA_APP_ID: z.string().min(1).optional(),
  ADZUNA_APP_KEY: z.string().min(1).optional(),
  SERPAPI_KEY: z.string().min(1).optional(),
  // Which embedding backend the knowledge base uses. "auto" = Gemini when
  // GEMINI_API_KEY is set, else the local Transformers.js model.
  EMBEDDINGS_PROVIDER: z.enum(["auto", "gemini", "local"]).optional(),
  // GitHub personal access token for the repo connector (read-only scopes:
  // `repo` for private, or none for public). Optional — public repos work
  // unauthenticated at 60 req/hr.
  GITHUB_TOKEN: z.string().min(1).optional(),
  // Shared secret for Vercel Cron routes.
  CRON_SECRET: z.string().min(1).optional(),
  // The single owner's auth.users id — lets cron skip an auth-schema lookup.
  OWNER_USER_ID: z.uuid().optional(),
  // Cloudflare R2 (S3-compatible) — source of truth for the applications/ tree.
  // All optional so the app boots before R2 is configured; the R2 store throws
  // a clear error if used without them.
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  // Cloudinary — visual proof (demo videos / screenshots / diagrams).
  // Format: cloudinary://<api_key>:<api_secret>@<cloud_name>
  CLOUDINARY_URL: z.string().min(1).optional(),
});

const optional = (v: string | undefined) => (v && v.length > 0 ? v : undefined);

const parsed = serverEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  APP_URL: resolveAppUrl(),
  ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
  GEMINI_API_KEY: optional(process.env.GEMINI_API_KEY),
  OPENAI_API_KEY: optional(process.env.OPENAI_API_KEY),
  ANTHROPIC_API_KEY: optional(process.env.ANTHROPIC_API_KEY),
  JSEARCH_API_KEY: optional(process.env.JSEARCH_API_KEY),
  ADZUNA_APP_ID: optional(process.env.ADZUNA_APP_ID),
  ADZUNA_APP_KEY: optional(process.env.ADZUNA_APP_KEY),
  SERPAPI_KEY: optional(process.env.SERPAPI_KEY),
  EMBEDDINGS_PROVIDER: optional(process.env.EMBEDDINGS_PROVIDER),
  GITHUB_TOKEN: optional(process.env.GITHUB_TOKEN),
  CRON_SECRET: optional(process.env.CRON_SECRET),
  OWNER_USER_ID: optional(process.env.OWNER_USER_ID),
  R2_ACCOUNT_ID: optional(process.env.R2_ACCOUNT_ID),
  R2_ACCESS_KEY_ID: optional(process.env.R2_ACCESS_KEY_ID),
  R2_SECRET_ACCESS_KEY: optional(process.env.R2_SECRET_ACCESS_KEY),
  R2_BUCKET: optional(process.env.R2_BUCKET),
  CLOUDINARY_URL: optional(process.env.CLOUDINARY_URL),
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
