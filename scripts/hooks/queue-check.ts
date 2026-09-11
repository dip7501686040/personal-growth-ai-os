/**
 * J7 — "no more typing 'process the queue'". A SessionStart hook (wired in
 * ~/.claude/settings.json, global, alongside the activity-collector hook)
 * that surfaces any /applications-queued work as context the moment a
 * session opens in this repo. Deliberately standalone (raw `postgres`, no
 * `@/` alias imports, no Next.js) so it starts fast and never depends on
 * this repo's dev server being up.
 *
 * Silent by design: wrong repo, no DB, no queue → exits 0 with no output.
 * Never throws — a broken hook must not block session start.
 */
import postgres from "postgres";

const REPO_ROOT = "/Users/dipankarsaha/personal-growth-ai-os";

interface HookInput {
  cwd?: string;
}

function readStdin(): Promise<HookInput> {
  return new Promise((resolve) => {
    let data = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        resolve(data ? (JSON.parse(data) as HookInput) : {});
      } catch {
        resolve({});
      }
    };
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
    setTimeout(finish, 500).unref();
  });
}

function emit(additionalContext: string) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
    }),
  );
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

async function main() {
  const h = await readStdin();
  const cwd = h.cwd || process.cwd();
  if (!cwd.startsWith(REPO_ROOT)) return; // not this project — stay silent

  const dbUrl = process.env.DATABASE_URL;
  const email = process.env.ALLOWED_EMAILS?.split(",")[0]?.trim().toLowerCase();
  if (!dbUrl || !email) return;

  const sql = postgres(dbUrl, { prepare: false, max: 1, connect_timeout: 4, idle_timeout: 1 });
  try {
    const rows = await withTimeout(
      sql<{ content: number; apply: number }[]>`
        select
          count(*) filter (
            where content_requested_at is not null
              and (content_prepared_at is null or content_prepared_at < content_requested_at)
          )::int as content,
          count(*) filter (
            where apply_requested_at is not null
              and (applied_at is null or applied_at < apply_requested_at)
          )::int as apply
        from job_applications
        where user_id = (select id from auth.users where lower(email) = ${email} limit 1)
      `,
      4000,
    );
    const row = rows?.[0];
    if (!row || (row.content === 0 && row.apply === 0)) return;

    emit(
      `pgai /applications has queued work: ${row.content} job(s) need content ` +
        `processing (visual proof + prose — run \`pnpm apply queue\` for the list, ` +
        `then the Group A tooling / regenerateProofBundle, then \`pnpm apply ` +
        `mark-content-prepared <id>\`), ${row.apply} job(s) queued to apply (apply-fill / ` +
        `apply-drive, user still clicks Submit). Start processing without waiting to be asked.`,
    );
  } catch {
    // DB unreachable / paused — never block session start over this
  } finally {
    try {
      await sql.end({ timeout: 1 });
    } catch {
      // ignore
    }
  }
}

main().catch(() => {});
