/**
 * Collector scenario test — no network, no deps. Verifies per-repo emission
 * and the day-boundary rollup by driving the hook commands directly.
 *
 *   node collector/test/scenario.ts
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTranscript } from "../src/transcripts.ts";
import {
  DATA_DIR,
  QUEUE_FILE,
  SESSIONS_DIR,
  TRANSCRIPTS_CURSOR,
} from "../src/config.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = join(HERE, "..", "src", "index.ts");

let passed = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    console.error(`FAIL  ${name}`);
    process.exitCode = 1;
  }
}

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function makeRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(["init", "-q"], dir);
  git(["config", "user.email", "t@t.dev"], dir);
  git(["config", "user.name", "t"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  git(["add", "-A"], dir);
  git(["commit", "-qm", "seed"], dir);
}

function hook(cmd: string, input: object, extra: string[] = []): void {
  execFileSync("node", [INDEX, cmd, ...extra], {
    input: JSON.stringify(input),
    stdio: ["pipe", "ignore", "inherit"],
    env: { ...process.env, PGAIOS_DEBUG: "0" },
  });
}

function queue(): Array<Record<string, unknown>> {
  if (!existsSync(QUEUE_FILE)) return [];
  return readFileSync(QUEUE_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function clearCollectorState(): void {
  rmSync(QUEUE_FILE, { force: true });
  rmSync(SESSIONS_DIR, { recursive: true, force: true });
  rmSync(TRANSCRIPTS_CURSOR, { force: true });
}

function sessionFile(): string {
  const f = readdirSync(SESSIONS_DIR).find((x) => x.endsWith(".json"));
  if (!f) throw new Error("no session file");
  return join(SESSIONS_DIR, f);
}

// ── setup ────────────────────────────────────────────────────────────────
mkdirSync(DATA_DIR, { recursive: true });
clearCollectorState();
const work = mkdtempSync(join(tmpdir(), "pgaios-collector-"));
const repoA = join(work, "repo-a");
const repoB = join(work, "repo-b");
makeRepo(repoA);
makeRepo(repoB);

try {
  // ── 1. multi-repo session → one event per repo ─────────────────────────
  const sid = "scenario-1";
  hook("session-start", { session_id: sid, cwd: repoA });

  writeFileSync(join(repoA, "a.ts"), "export const a = 1;\n");
  hook("file-activity", {
    session_id: sid,
    tool_input: { file_path: join(repoA, "a.ts") },
  });

  writeFileSync(join(repoB, "b.ts"), "export const b = 2;\n");
  hook("file-activity", {
    session_id: sid,
    tool_input: { file_path: join(repoB, "b.ts") },
  });
  git(["add", "-A"], repoB);
  git(["commit", "-qm", "add b"], repoB);

  hook("session-end", { session_id: sid });

  const evs = queue();
  const names = evs.map((e) => e.projectName).sort();
  check("multi-repo: two coding_session rows", evs.length === 2);
  check("multi-repo: one per repo", names.join(",") === "repo-a,repo-b");
  const bEvent = evs.find((e) => e.projectName === "repo-b");
  check(
    "multi-repo: repo-b event has its own commit",
    Array.isArray((bEvent?.git as { commits?: unknown[] })?.commits) &&
      ((bEvent!.git as { commits: unknown[] }).commits.length === 1),
  );

  // ── 2. day-boundary rollup on the Stop hook ───────────────────────────
  clearCollectorState();
  const sid2 = "scenario-2";
  hook("session-start", { session_id: sid2, cwd: repoA });
  writeFileSync(join(repoA, "day1.ts"), "export const d1 = 1;\n");
  hook("file-activity", {
    session_id: sid2,
    tool_input: { file_path: join(repoA, "day1.ts") },
  });

  // pretend the window opened yesterday
  const sf = sessionFile();
  const st = JSON.parse(readFileSync(sf, "utf8"));
  const yesterday = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
  st.windowStartAt = yesterday;
  writeFileSync(sf, JSON.stringify(st));

  hook("checkpoint", { session_id: sid2 });

  const afterRoll = queue();
  check("rollup: one event emitted on the day boundary", afterRoll.length === 1);
  const st2 = JSON.parse(readFileSync(sf, "utf8"));
  check(
    "rollup: window reset to today",
    st2.windowStartAt.slice(0, 10) === new Date().toISOString().slice(0, 10),
  );
  check(
    "rollup: touched list cleared",
    Object.values(st2.repos).every(
      (r) => (r as { touched: string[] }).touched.length === 0,
    ),
  );

  // more work in the new window → a second, separate event on session end
  writeFileSync(join(repoA, "day2.ts"), "export const d2 = 2;\n");
  hook("file-activity", {
    session_id: sid2,
    tool_input: { file_path: join(repoA, "day2.ts") },
  });
  hook("session-end", { session_id: sid2 });
  check("rollup: second window emits its own event", queue().length === 2);

  // ── 3. transcript parsing ────────────────────────────────────────────
  const jsonl = join(work, "t.jsonl");
  writeFileSync(
    jsonl,
    [
      JSON.stringify({ type: "bridge-session", sessionId: "x" }),
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "How do I debounce in React?" },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "internal" },
            { type: "text", text: "Use a ref + setTimeout, clear on each call." },
            { type: "tool_use", name: "Edit", input: {} },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", content: "ok" }],
        },
      }),
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "<system-reminder>ignore me</system-reminder>" },
      }),
    ].join("\n"),
  );
  const parsed = parseTranscript(jsonl, 0);
  check("transcript: keeps user prose", parsed.text.includes("How do I debounce"));
  check(
    "transcript: keeps assistant text",
    parsed.text.includes("ref + setTimeout"),
  );
  check("transcript: drops thinking", !parsed.text.includes("internal"));
  check("transcript: drops tool_result turn", !parsed.text.includes("ok"));
  check(
    "transcript: drops system-reminder turn",
    !parsed.text.includes("ignore me"),
  );

  console.log(`\n${passed} checks passed`);
} finally {
  rmSync(work, { recursive: true, force: true });
  clearCollectorState();
}
