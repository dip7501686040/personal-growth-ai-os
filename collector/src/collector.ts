import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SESSIONS_DIR } from "./config.ts";

/** One repo's edit window within a session (reset on a day-boundary rollup). */
export interface RepoWindow {
  /** git repo root (realpath) */
  root: string;
  /** project name for this repo */
  name: string;
  branch: string | null;
  /** HEAD when this window started */
  startHead: string | null;
  /** absolute file paths Claude edited in this window */
  touched: string[];
}

export interface SessionState {
  sessionId: string;
  cwd: string;
  /** when the session began */
  startedAt: string;
  /** anchor for the day-boundary rollup — reset each time a window is flushed */
  windowStartAt: string;
  /** repo root → its current edit window */
  repos: Record<string, RepoWindow>;
}

const stateFile = (id: string) =>
  join(SESSIONS_DIR, `${id.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);

export function loadSession(id: string): SessionState | null {
  const p = stateFile(id);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as SessionState;
  } catch {
    return null;
  }
}

export function saveSession(s: SessionState): void {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  writeFileSync(stateFile(s.sessionId), JSON.stringify(s, null, 2));
}

export function deleteSession(id: string): void {
  try {
    rmSync(stateFile(id));
  } catch {
    // ignore
  }
}

/** Every on-disk session state (used to finalize sessions left open across days). */
export function listSessions(): SessionState[] {
  let files: string[];
  try {
    files = readdirSync(SESSIONS_DIR);
  } catch {
    return [];
  }
  const out: SessionState[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(readFileSync(join(SESSIONS_DIR, f), "utf8")));
    } catch {
      // ignore malformed
    }
  }
  return out;
}

/** Local YYYY-MM-DD for a timestamp — the rollup boundary. */
export function localDay(iso: string | number | Date): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
