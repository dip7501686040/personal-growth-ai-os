import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { config, debug, TRANSCRIPTS_CURSOR } from "./config.ts";
import { enqueue } from "./queue.ts";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");
const MAX_JOB_CHARS = 24_000;
const MIN_DELTA_CHARS = 200;
const BACKFILL_MAX_FILES = 200;

// ── cursor ────────────────────────────────────────────────────────────────

type Cursor = Record<string, number>;

function readCursor(): Cursor {
  try {
    return JSON.parse(readFileSync(TRANSCRIPTS_CURSOR, "utf8")) as Cursor;
  } catch {
    return {};
  }
}

function writeCursor(c: Cursor): void {
  mkdirSync(join(TRANSCRIPTS_CURSOR, ".."), { recursive: true });
  writeFileSync(TRANSCRIPTS_CURSOR, JSON.stringify(c, null, 2));
}

// ── locating a session's transcript ──────────────────────────────────────

function slugForCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

export function transcriptPathFor(
  sessionId: string,
  cwd: string,
): string | null {
  const direct = join(PROJECTS_DIR, slugForCwd(cwd), `${sessionId}.jsonl`);
  if (existsSync(direct)) return direct;
  // fall back: scan every project dir for <sessionId>.jsonl
  try {
    for (const dir of readdirSync(PROJECTS_DIR)) {
      const p = join(PROJECTS_DIR, dir, `${sessionId}.jsonl`);
      if (existsSync(p)) return p;
    }
  } catch {
    // ignore
  }
  return null;
}

// ── parsing ──────────────────────────────────────────────────────────────

interface TranscriptLine {
  type?: string;
  message?: { role?: string; content?: unknown };
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (b): b is { type: string; text: string } =>
          !!b &&
          typeof b === "object" &&
          (b as { type?: string }).type === "text" &&
          typeof (b as { text?: unknown }).text === "string",
      )
      .map((b) => b.text)
      .join("\n")
      .trim();
  }
  return "";
}

function isNoise(who: string, text: string): boolean {
  if (text.length < 2) return true;
  if (/^\[Request interrupted/.test(text)) return true;
  // a user turn that's only a system-reminder / injected context
  if (who === "User" && /^<(system-reminder|command-)/.test(text.trim())) {
    return true;
  }
  return false;
}

/** Trimmed user+assistant prose from line `fromLine` onward. */
export function parseTranscript(
  path: string,
  fromLine = 0,
): { text: string; lastLine: number } {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { text: "", lastLine: fromLine };
  }
  const lines = raw.split("\n");
  const parts: string[] = [];

  for (let i = fromLine; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    let o: TranscriptLine;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type !== "user" && o.type !== "assistant") continue;
    const who = o.type === "user" ? "User" : "Assistant";
    const text = textFromContent(o.message?.content);
    if (!text || isNoise(who, text)) continue;
    parts.push(`${who}: ${text}`);
  }

  return { text: parts.join("\n\n"), lastLine: lines.length };
}

// ── enqueue ──────────────────────────────────────────────────────────────

function capTail(s: string, n: number): string {
  return s.length <= n ? s : s.slice(s.length - n);
}

function enqueueTranscript(sessionId: string, text: string): void {
  const capped = capTail(text.trim(), MAX_JOB_CHARS);
  if (capped.length < MIN_DELTA_CHARS) return;
  enqueue({
    __t: "transcript",
    sessionId,
    title: `Claude Code session ${sessionId.slice(0, 8)}`,
    text: capped,
  });
  debug(`transcript: queued ${capped.length} chars for ${sessionId}`);
}

/** Sync new turns from the current session's transcript. */
export function syncCurrentTranscript(sessionId: string, cwd: string): void {
  if (!config.syncTranscripts) return;
  const path = transcriptPathFor(sessionId, cwd);
  if (!path) {
    debug(`transcript: no file for ${sessionId}`);
    return;
  }
  const cursor = readCursor();
  const from = cursor[path] ?? 0;
  const { text, lastLine } = parseTranscript(path, from);
  if (text.length >= MIN_DELTA_CHARS) enqueueTranscript(sessionId, text);
  cursor[path] = lastLine;
  writeCursor(cursor);
}

/** One-time: walk every existing transcript and queue what's new. */
export function backfillTranscripts(): number {
  let dirs: string[];
  try {
    dirs = readdirSync(PROJECTS_DIR);
  } catch {
    debug("transcript backfill: no ~/.claude/projects");
    return 0;
  }

  const files: { path: string; sessionId: string; mtime: number }[] = [];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = readdirSync(join(PROJECTS_DIR, dir));
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!f.endsWith(".jsonl")) continue;
      const path = join(PROJECTS_DIR, dir, f);
      try {
        files.push({
          path,
          sessionId: f.replace(/\.jsonl$/, ""),
          mtime: statSync(path).mtimeMs,
        });
      } catch {
        // ignore
      }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);

  const cursor = readCursor();
  let queued = 0;
  for (const { path, sessionId } of files.slice(0, BACKFILL_MAX_FILES)) {
    const from = cursor[path] ?? 0;
    const { text, lastLine } = parseTranscript(path, from);
    if (text.length >= MIN_DELTA_CHARS) {
      enqueueTranscript(sessionId, text);
      queued++;
    }
    cursor[path] = lastLine;
  }
  writeCursor(cursor);
  debug(`transcript backfill: queued ${queued} of ${files.length} files`);
  return queued;
}
