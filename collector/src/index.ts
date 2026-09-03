import {
  onCheckpoint,
  onFileActivity,
  onSessionEnd,
  onSessionStart,
  readStdin,
} from "./hooks.ts";
import { sweepStaleSessions } from "./maintenance.ts";
import { drainQueue } from "./sync.ts";
import { backfillTranscripts, syncCurrentTranscript } from "./transcripts.ts";

const commands: Record<string, () => Promise<void>> = {
  "session-start": onSessionStart,
  "file-activity": onFileActivity,
  checkpoint: onCheckpoint,
  "session-end": onSessionEnd,
  sync: async () => {
    sweepStaleSessions();
    await drainQueue();
  },
  transcripts: async () => {
    if (process.argv.includes("--backfill")) {
      const n = backfillTranscripts();
      console.error(`[pgaios-collector] transcript backfill queued ${n} session(s)`);
    } else {
      const h = await readStdin();
      if (h.session_id) {
        syncCurrentTranscript(h.session_id, h.cwd || process.cwd());
      }
    }
    await drainQueue();
  },
};

const name = process.argv[2] ?? "";
const fn = commands[name];

if (!fn) {
  console.error(
    `pgaios-collector: unknown command "${name}". Expected one of: ${Object.keys(commands).join(", ")}`,
  );
  process.exit(1);
}

// A hook must never fail the Claude Code session — always exit 0.
fn()
  .catch((e) => console.error("[pgaios-collector]", e))
  .finally(() => process.exit(0));
