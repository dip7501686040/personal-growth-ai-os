import { config, debug } from "./config.ts";
import { readQueue, rewriteQueue } from "./queue.ts";

type SendResult = "ok" | "retry" | "drop";

async function send(event: unknown): Promise<SendResult> {
  if (!config.ingestToken) {
    debug("no PGAIOS_INGEST_TOKEN set — keeping event for later");
    return "retry";
  }
  try {
    const res = await fetch(`${config.apiBaseUrl}/api/activity/ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.ingestToken}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) return "ok";
    // 401 (bad/revoked token) and 400 (bad payload) won't fix themselves.
    if (res.status === 401 || res.status === 400) {
      debug(`dropping event after HTTP ${res.status}`);
      return "drop";
    }
    debug(`retry after HTTP ${res.status}`);
    return "retry";
  } catch (e) {
    debug("network error, will retry:", (e as Error).message);
    return "retry";
  }
}

/** Tries to send every queued event; keeps only the ones that should be retried. */
export async function drainQueue(): Promise<void> {
  const events = readQueue();
  if (events.length === 0) return;
  const keep: unknown[] = [];
  for (const event of events) {
    const result = await send(event);
    if (result === "retry") keep.push(event);
  }
  rewriteQueue(keep);
  debug(`drain complete: ${events.length - keep.length} sent, ${keep.length} kept`);
}
