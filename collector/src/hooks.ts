import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import { debug } from "./config.ts";
import {
  deleteSession,
  loadSession,
  saveSession,
  type SessionState,
} from "./collector.ts";
import * as git from "./git.ts";
import { sweepStaleSessions } from "./maintenance.ts";
import { detectProject } from "./project-detector.ts";
import { enqueue } from "./queue.ts";
import { drainQueue } from "./sync.ts";

interface HookInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: { file_path?: string };
  reason?: string;
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
    setTimeout(finish, 800).unref();
  });
}

export async function onSessionStart(): Promise<void> {
  sweepStaleSessions();
  const h = await readStdin();
  const sessionId = h.session_id || randomUUID();
  const cwd = h.cwd || process.cwd();
  const { projectPath, projectName } = detectProject(cwd);
  const state: SessionState = {
    sessionId,
    cwd,
    projectPath,
    projectName,
    startedAt: new Date().toISOString(),
    startHead: git.head(cwd),
    branch: git.branch(cwd),
    touched: [],
  };
  saveSession(state);
  debug("session start", sessionId, projectName);
}

export async function onFileActivity(): Promise<void> {
  const h = await readStdin();
  if (!h.session_id) return;
  const state = loadSession(h.session_id);
  if (!state) return;
  const fp = h.tool_input?.file_path;
  if (fp && !state.touched.includes(fp)) {
    state.touched.push(fp);
    saveSession(state);
  }
}

/** Stop hook — a good moment to flush the offline queue. */
export async function onCheckpoint(): Promise<void> {
  await readStdin();
  await drainQueue();
}

export async function onSessionEnd(): Promise<void> {
  const h = await readStdin();
  const state = h.session_id ? loadSession(h.session_id) : null;

  if (state) {
    const cwd = state.cwd;
    const endedAt = new Date().toISOString();

    // Candidate repo roots (handles /tmp <-> /private/tmp symlinks on macOS).
    let realRoot = state.projectPath;
    try {
      realRoot = realpathSync(state.projectPath);
    } catch {
      // ignore
    }
    const roots = [
      ...new Set([
        realRoot,
        state.projectPath,
        realRoot.replace(/^\/private/, ""),
        `/private${realRoot}`,
      ]),
    ];
    const toRel = (abs: string): string => {
      let a = abs;
      try {
        a = realpathSync(abs);
      } catch {
        // deleted file — keep the raw path
      }
      for (const cand of [a, abs]) {
        for (const r of roots) {
          if (cand === r) return ".";
          if (cand.startsWith(`${r}/`)) return cand.slice(r.length + 1);
        }
      }
      return basename(abs); // last resort — a bare filename, not a machine path
    };

    const status = git.changedPaths(cwd, state.startHead);
    const created: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    for (const abs of state.touched) {
      const rel = toRel(abs);
      const code = status.get(rel) ?? "";
      if (code === "D") deleted.push(rel);
      else if (code === "A") created.push(rel);
      else modified.push(rel);
    }

    const commits = git.commitsSince(cwd, state.startHead);
    const stats = git.diffStats(cwd, state.startHead);
    const changeCount =
      created.length + modified.length + deleted.length + commits.length;

    if (changeCount > 0) {
      enqueue({
        clientEventId: randomUUID(),
        source: "claude_code",
        eventType: "coding_session",
        sessionId: state.sessionId,
        projectPath: state.projectPath,
        projectName: state.projectName,
        startedAt: state.startedAt,
        endedAt,
        durationSeconds: Math.max(
          0,
          Math.round((Date.parse(endedAt) - Date.parse(state.startedAt)) / 1000),
        ),
        files: { created, modified, deleted },
        git: {
          branch: git.branch(cwd) || state.branch || undefined,
          commits,
          stats,
        },
        sessionSummary: commits[0]?.message || h.reason || undefined,
      });
      debug("session end — enqueued", changeCount, "changes");
    } else {
      debug("session end — nothing to capture");
    }
    deleteSession(state.sessionId);
  }

  await drainQueue();
}
