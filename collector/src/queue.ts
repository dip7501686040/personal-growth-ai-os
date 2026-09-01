import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { DATA_DIR, QUEUE_FILE } from "./config.ts";

/** Append-only offline queue. One JSON object per line. */
export function enqueue(event: unknown): void {
  mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(QUEUE_FILE, `${JSON.stringify(event)}\n`);
}

export function readQueue(): unknown[] {
  if (!existsSync(QUEUE_FILE)) return [];
  return readFileSync(QUEUE_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((e) => e !== null);
}

export function rewriteQueue(events: unknown[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${QUEUE_FILE}.tmp`;
  writeFileSync(
    tmp,
    events.length ? `${events.map((e) => JSON.stringify(e)).join("\n")}\n` : "",
  );
  renameSync(tmp, QUEUE_FILE);
}
