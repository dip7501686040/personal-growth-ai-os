import { mkdirSync, rmSync, statSync } from "node:fs";
import { config, debug, DRAIN_LOCK } from "./config.ts";
import { pruneQueue } from "./maintenance.ts";
import { readQueue, rewriteQueue } from "./queue.ts";

type SendResult = "ok" | "retry" | "drop";

const LOCK_STALE_MS = 2 * 60 * 1000;

interface TranscriptEnvelope {
  __t: "transcript";
  sessionId: string;
  title?: string;
  text: string;
}

function isTranscript(e: unknown): e is TranscriptEnvelope {
  return !!e && typeof e === "object" && (e as { __t?: string }).__t === "transcript";
}

async function post(path: string, body: unknown): Promise<SendResult> {
  try {
    const res = await fetch(`${config.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.ingestToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return "ok";
    if (res.status === 401 || res.status === 400) {
      debug(`dropping event after HTTP ${res.status} from ${path}`);
      return "drop";
    }
    debug(`retry after HTTP ${res.status} from ${path}`);
    return "retry";
  } catch (e) {
    debug("network error, will retry:", (e as Error).message);
    return "retry";
  }
}

async function send(event: unknown): Promise<SendResult> {
  if (!config.ingestToken) {
    debug("no PGAIOS_INGEST_TOKEN set — keeping event for later");
    return "retry";
  }
  if (isTranscript(event)) {
    return post("/api/ingest/transcripts", {
      sessionId: event.sessionId,
      title: event.title,
      text: event.text,
    });
  }
  return post("/api/activity/ingest", event);
}

/** Non-blocking lock so two concurrent hook processes don't race the queue. */
function acquireLock(): boolean {
  try {
    mkdirSync(DRAIN_LOCK);
    return true;
  } catch {
    try {
      if (Date.now() - statSync(DRAIN_LOCK).mtimeMs > LOCK_STALE_MS) {
        rmSync(DRAIN_LOCK, { recursive: true, force: true });
        mkdirSync(DRAIN_LOCK);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }
}

function releaseLock(): void {
  try {
    rmSync(DRAIN_LOCK, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/** Send every queued event; keep the ones that should be retried. */
export async function drainQueue(): Promise<void> {
  if (!acquireLock()) {
    debug("drain skipped — another process holds the lock");
    return;
  }
  try {
    pruneQueue();
    const events = readQueue();
    if (events.length === 0) return;
    const keep: unknown[] = [];
    for (const event of events) {
      if ((await send(event)) === "retry") keep.push(event);
    }
    rewriteQueue(keep);
    debug(`drain complete: ${events.length - keep.length} sent, ${keep.length} kept`);
  } finally {
    releaseLock();
  }
}
