import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const DATA_DIR = join(root, "data");
export const SESSIONS_DIR = join(DATA_DIR, "sessions");
export const QUEUE_FILE = join(DATA_DIR, "pending-events.jsonl");

/** Minimal .env loader (no dependency). Only sets vars that aren't already set. */
function loadEnvFile(): void {
  const p = join(root, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvFile();

interface FileConfig {
  apiBaseUrl?: string;
  projects?: Record<string, string>;
}

let fileConfig: FileConfig = {};
const cfgPath = join(root, "config", "config.json");
if (existsSync(cfgPath)) {
  try {
    fileConfig = JSON.parse(readFileSync(cfgPath, "utf8"));
  } catch {
    // ignore malformed config
  }
}

export const config = {
  apiBaseUrl:
    process.env.PGAIOS_API_BASE_URL ||
    fileConfig.apiBaseUrl ||
    "http://localhost:3000",
  ingestToken: process.env.PGAIOS_INGEST_TOKEN || "",
  /** Optional map: absolute path → your project name/id (overrides detection). */
  projects: fileConfig.projects ?? {},
  debug: process.env.PGAIOS_DEBUG === "1",
};

export function debug(...args: unknown[]): void {
  if (config.debug) console.error("[pgaios-collector]", ...args);
}
