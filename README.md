# Personal Growth AI OS

A single-user personal AI operating system. Six specialized agents — Learning,
Project / Proof-of-Work, Career, Content, Business, and Chief of Staff — share
one evolving **Proof-of-Skills graph** so the whole thing behaves as one
connected intelligence, not six chatbots.

See [`docs/system-design.md`](docs/system-design.md) and
[`docs/mvp-scope.md`](docs/mvp-scope.md).

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript strict
- Tailwind CSS v4 · shadcn/ui
- Supabase (Postgres, Auth, Realtime, Storage)
- Drizzle ORM
- Zod
- Gemini + OpenAI behind an `LLMProvider` abstraction (Phase 3+)
- Vercel Cron (Phase 3+)

## Local setup

Requires Node 24 (`nvm use` picks it up if you have nvm) and pnpm.

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm dev                     # http://localhost:3000
```

### Environment

Fill `.env.local` from `.env.example`:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same |
| `SUPABASE_SERVICE_ROLE_KEY` | same (server only) |
| `DATABASE_URL` | Supabase → Database → Connection string → Transaction pooler (port 6543) |
| `DIRECT_URL` | Session pooler / direct (port 5432), used for migrations — optional |
| `APP_URL` | `http://localhost:3000` locally; the deployed URL in production |

Later phases add `GEMINI_API_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`, `INGEST_TOKEN`.

### Supabase Auth config

In the Supabase dashboard → Authentication → URL Configuration:

- **Site URL**: `http://localhost:3000` (and your Vercel URL for production)
- **Redirect URLs**: add `http://localhost:3000/auth/callback`,
  `http://localhost:3000/auth/confirm`, and the same two on your Vercel domain.

The default magic-link email template works as-is (it redirects to
`/auth/callback` with a `code`). `/auth/confirm` is also provided for the
`token_hash` template variant.

## Database

```bash
pnpm db:generate   # create a migration from src/lib/db/schema
pnpm db:migrate    # apply migrations
pnpm db:studio     # browse data
```

Phase 1 introduces no application tables — Supabase manages `auth.users`.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:*` | Drizzle Kit |

## Project layout

```
src/
  app/            routes, server actions, route handlers, auth callbacks
  proxy.ts        Next 16 proxy: Supabase session refresh + route guard
  modules/        domain logic (added per phase)
  lib/
    db/           Drizzle client + schema barrel
    supabase/     server / client / middleware helpers
    env.ts        Zod-validated server environment
    nav.ts        sidebar nav config
  components/      UI (shadcn/ui + app components)
collector/        standalone Mac activity collector (Phase 2.5)
docs/             system design + MVP scope
drizzle/          generated SQL migrations
```
