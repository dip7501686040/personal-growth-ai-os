import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { debug, SESSIONS_DIR } from "./config.ts";
import { readQueue, rewriteQueue } from "./queue.ts";

const STALE_SESSION_MS = 24 * 60 * 60 * 1000; // 1 day
const QUEUE_MAX_EVENTS = 1000;
const QUEUE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Deletes per-session state files whose session never ended (Claude Code
 * crashed / was force-quit). Recovering a diff a day later would be wrong, so
 * these are just removed.
 */
export function sweepStaleSessions(): void {
  let files: string[];
  try {
    files = readdirSync(SESSIONS_DIR);
  } catch {
    return;
  }
  const now = Date.now();
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const p = join(SESSIONS_DIR, f);
    try {
      if (now - statSync(p).mtimeMs > STALE_SESSION_MS) {
        rmSync(p);
        debug("swept stale session file", f);
      }
    } catch {
      // ignore
    }
  }
}

/** Drops events too old to be worth uploading, and caps the queue length. */
export function pruneQueue(): void {
  const events = readQueue() as { endedAt?: string }[];
  if (events.length === 0) return;
  const cutoff = Date.now() - QUEUE_MAX_AGE_MS;
  let kept = events.filter(
    (e) => !e.endedAt || Date.parse(e.endedAt) >= cutoff,
  );
  if (kept.length > QUEUE_MAX_EVENTS) kept = kept.slice(-QUEUE_MAX_EVENTS);
  if (kept.length !== events.length) {
    rewriteQueue(kept);
    debug(`pruned queue: ${events.length} -> ${kept.length}`);
  }
}
