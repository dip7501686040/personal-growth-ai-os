/**
 * Runs one agent end-to-end from the command line so you can step through the
 * whole flow in the VS Code debugger — no Next.js server, no auth, no browser
 * in the way.
 *
 *   node --import tsx --env-file=.env.local scripts/debug-agent.ts learning
 *
 * In VS Code: pick "Debug: agent (direct, end-to-end)" in the Run panel and
 * press F5. Good breakpoints for the Learning flow:
 *
 *   src/app/api/agents/[name]/run/route.ts   HTTP entry (only via "server-side" config)
 *   src/modules/agents/base-agent.ts         run() lifecycle / FSM / abort checks
 *   src/modules/agents/learning-agent.ts     gatherContext / analyze / buildRecommendations
 *   src/lib/llm/index.ts                     runStructured — model ladder + quota skips
 *   src/lib/llm/gemini.ts | openai.ts        the actual provider HTTP call
 *
 * User resolution: OWNER_USER_ID if set, otherwise the first address in
 * ALLOWED_EMAILS looked up via the Supabase admin API.
 */

export {}; // module scope — keep top-level names out of the global script scope

// The transaction pooler (DATABASE_URL, port 6543) kills the first query after
// a paused free-tier project wakes up (statement timeout, SQLSTATE 57014).
// Point the db client at the session pooler (DIRECT_URL, port 5432) instead.
// This MUST happen before "@/lib/db" is imported, hence the dynamic imports.
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

async function resolveUserId(): Promise<string> {
  const explicit = process.env.OWNER_USER_ID;
  if (explicit) return explicit;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = (process.env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim();
  if (!url || !serviceKey || !email) {
    throw new Error(
      "Set OWNER_USER_ID, or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ALLOWED_EMAILS in .env.local.",
    );
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const found = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!found) throw new Error(`No auth user for ${email}`);
  return found.id;
}

async function main() {
  const name = process.argv[2] ?? "learning";

  const { warmupDb } = await import("../src/lib/db/index.ts");
  const { getAgent } = await import("../src/modules/agents/index.ts");

  const agent = getAgent(name);
  if (!agent) throw new Error(`Unknown agent: ${name}`);

  const userId = await resolveUserId();

  process.stdout.write("· waking the database…\n");
  await warmupDb(8);

  console.log(`▶ running "${name}" for user ${userId}\n`);

  const startedAt = Date.now();
  const run = await agent.run({ userId, trigger: "manual" });

  console.log(`\n✔ finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log({
    id: run.id,
    status: run.status,
    model: run.modelUsed,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    estimatedCostUsd: run.estimatedCostUsd,
    error: run.error,
  });
  console.dir(run.result, { depth: 6 });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
