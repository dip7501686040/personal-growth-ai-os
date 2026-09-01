import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SESSIONS_DIR } from "./config.ts";

export interface SessionState {
  sessionId: string;
  cwd: string;
  projectPath: string;
  projectName: string;
  startedAt: string;
  startHead: string | null;
  branch: string | null;
  /** Absolute file paths Claude edited/wrote this session. */
  touched: string[];
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
