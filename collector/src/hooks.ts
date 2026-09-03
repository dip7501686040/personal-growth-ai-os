import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import {
  deleteSession,
  listSessions,
  loadSession,
  localDay,
  saveSession,
  type RepoWindow,
  type SessionState,
} from "./collector.ts";
import { config, debug } from "./config.ts";
import { finalizeSession } from "./finalize.ts";
import * as git from "./git.ts";
import { sweepStaleSessions } from "./maintenance.ts";
import { detectProject } from "./project-detector.ts";
import { drainQueue } from "./sync.ts";
import { syncCurrentTranscript } from "./transcripts.ts";

/** A window is stale after this even if the local day hasn't ticked over. */
const WINDOW_MAX_MS = 18 * 60 * 60 * 1000;

interface HookInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: { file_path?: string };
  reason?: string;
}

export function readStdin(): Promise<HookInput> {
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
    setTimeout(finish, 800).unref();
  });
}

/** Snapshot a repo's current state as a fresh edit window. */
function snapshotRepo(root: string): RepoWindow {
  const { projectName } = detectProject(root);
  return {
    root,
    name: projectName,
    branch: git.branch(root),
    startHead: git.head(root),
    touched: [],
  };
}

/** The git repo root containing `path`, or null. */
function repoRootFor(path: string): string | null {
  return git.repoRoot(dirname(path)) ?? null;
}

/** Roll every window forward: finalize it, then reset its baseline to HEAD. */
function rollWindows(state: SessionState, at: string): void {
  finalizeSession(state.repos, state.sessionId, state.windowStartAt, at);
  for (const repo of Object.values(state.repos)) {
    repo.startHead = git.head(repo.root);
    repo.touched = [];
  }
  state.windowStartAt = at;
  saveSession(state);
}

export async function onSessionStart(): Promise<void> {
  sweepStaleSessions();
  const h = await readStdin();
  const now = new Date().toISOString();
  const today = localDay(now);

  // Finalize any session left open across a day boundary (lid closed Friday,
  // reopened Monday) so its work isn't lumped into one giant row.
  for (const s of listSessions()) {
    if (s.sessionId === h.session_id) continue;
    if (localDay(s.windowStartAt) !== today) {
      const fired = finalizeSession(
        s.repos,
        s.sessionId,
        s.windowStartAt,
        new Date(Date.parse(s.windowStartAt) + 60_000).toISOString(),
      );
      deleteSession(s.sessionId);
      debug(`carried-over session ${s.sessionId}: ${fired} event(s)`);
    }
  }

  const sessionId = h.session_id || randomUUID();
  const cwd = h.cwd || process.cwd();
  const repos: Record<string, RepoWindow> = {};
  const root = git.repoRoot(cwd);
  if (root) repos[root] = snapshotRepo(root);

  const state: SessionState = {
    sessionId,
    cwd,
    startedAt: now,
    windowStartAt: now,
    repos,
  };
  saveSession(state);
  debug("session start", sessionId, root ? repos[root].name : "(no repo)");
}

export async function onFileActivity(): Promise<void> {
  const h = await readStdin();
  if (!h.session_id) return;
  const state = loadSession(h.session_id);
  if (!state) return;

  const fp = h.tool_input?.file_path;
  if (!fp) return;
  const root = repoRootFor(fp);
  if (!root) return;

  if (!state.repos[root]) state.repos[root] = snapshotRepo(root);
  if (!state.repos[root].touched.includes(fp)) {
    state.repos[root].touched.push(fp);
    saveSession(state);
  }
}

/** Stop hook — roll the window on a day boundary, then flush the queue. */
export async function onCheckpoint(): Promise<void> {
  const h = await readStdin();
  const state = h.session_id ? loadSession(h.session_id) : null;

  if (state) {
    const now = new Date().toISOString();
    const rolled =
      localDay(now) !== localDay(state.windowStartAt) ||
      Date.now() - Date.parse(state.windowStartAt) > WINDOW_MAX_MS;
    if (rolled) {
      debug("day-boundary rollup");
      rollWindows(state, now);
    }
    if (config.syncTranscripts) {
      syncCurrentTranscript(state.sessionId, state.cwd);
    }
  }

  await drainQueue();
}

export async function onSessionEnd(): Promise<void> {
  const h = await readStdin();
  const state = h.session_id ? loadSession(h.session_id) : null;

  if (state) {
    const endedAt = new Date().toISOString();
    const fired = finalizeSession(
      state.repos,
      state.sessionId,
      state.windowStartAt,
      endedAt,
    );
    debug(`session end — ${fired} event(s)`);
    if (config.syncTranscripts) {
      syncCurrentTranscript(state.sessionId, state.cwd);
    }
    deleteSession(state.sessionId);
  }

  await drainQueue();
}
