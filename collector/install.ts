import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const collectorDir = dirname(fileURLToPath(import.meta.url));
const entry = join(collectorDir, "src", "index.ts");
const node = process.execPath;
const settingsPath = join(homedir(), ".claude", "settings.json");

const cmd = (event: string) => `${node} ${entry} ${event}`;
const MARKER = "src/index.ts";

const NEW_HOOKS: Record<string, unknown[]> = {
  SessionStart: [{ hooks: [{ type: "command", command: cmd("session-start") }] }],
  PostToolUse: [
    {
      matcher: "Edit|Write|MultiEdit",
      hooks: [{ type: "command", command: cmd("file-activity") }],
    },
  ],
  Stop: [{ hooks: [{ type: "command", command: cmd("checkpoint") }] }],
  SessionEnd: [{ hooks: [{ type: "command", command: cmd("session-end") }] }],
};

let settings: Record<string, unknown> = {};
if (existsSync(settingsPath)) {
  const backup = `${settingsPath}.bak-${Date.now()}`;
  copyFileSync(settingsPath, backup);
  console.log("Backed up existing settings to", backup);
  settings = JSON.parse(readFileSync(settingsPath, "utf8"));

  // keep only the 3 most recent backups
  const dir = dirname(settingsPath);
  const old = readdirSync(dir)
    .filter((f) => f.startsWith("settings.json.bak-"))
    .sort()
    .slice(0, -3);
  for (const f of old) {
    try {
      rmSync(join(dir, f));
    } catch {
      // ignore
    }
  }
}

const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
for (const [event, groups] of Object.entries(NEW_HOOKS)) {
  const existing = (hooks[event] ?? []).filter(
    (g) => !JSON.stringify(g).includes(MARKER),
  );
  hooks[event] = [...existing, ...groups];
}
settings.hooks = hooks;

mkdirSync(dirname(settingsPath), { recursive: true });
writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

console.log("\nInstalled collector hooks into", settingsPath);
console.log("Node binary:", node);
console.log("Entry:", entry);
console.log("\nStart a NEW Claude Code session for the hooks to take effect.");
console.log("Set PGAIOS_INGEST_TOKEN in collector/.env before real use.");
