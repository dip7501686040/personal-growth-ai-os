import { NextResponse } from "next/server";
import { warmupDb } from "@/lib/db";
import { recordCronFinish, recordCronStart } from "@/lib/cron-runs";
import { env } from "@/lib/env";
import { listDocumentsForMapping } from "@/lib/knowledge";
import { getOwnerUserId } from "@/lib/owner";
import { chiefOfStaffAgent } from "@/modules/agents/chief-of-staff-agent";
import { learningAgent } from "@/modules/agents/learning-agent";
import { backfillEntityEmbeddings, getEntityWatermark } from "@/modules/knowledge/entities";
import { mapDocument } from "@/modules/knowledge/mapping";
import { drainContextEvents } from "@/modules/ingestion/refresh";

export const maxDuration = 60;

/**
 * job name → handler.
 *
 * Scheduled (see vercel.json): `daily-learning`, `morning-briefing`.
 *
 * `knowledge-refresh` / `knowledge-map` are kept here but **no longer
 * scheduled** — Phase 1 of the skill-graph-manager plan retired every
 * extraction/maintenance cron (`daily-activity`, `github-sync`, `ingest-drain`
 * too). Phase 6 folds their bodies into `resyncKnowledge()` (inline at every
 * mutation) + `pnpm knowledge:resync`. Until then these two remain a manual
 * stop-gap you can `curl` with the CRON_SECRET.
 */
const JOBS: Record<string, (userId: string) => Promise<{ id: string; status: string }>> =
  {
    "daily-learning": async (userId) => {
      const run = await learningAgent.run({
        userId,
        trigger: "schedule",
        triggerKey: new Date().toISOString().slice(0, 10),
      });
      return { id: run.id, status: run.status };
    },
    "morning-briefing": async (userId) => {
      const run = await chiefOfStaffAgent.run({
        userId,
        trigger: "schedule",
        triggerKey: new Date().toISOString().slice(0, 10),
        force: true,
      });
      return { id: run.id, status: run.status };
    },
    // ── unscheduled: manual knowledge stop-gap until Phase 6's resyncKnowledge ──
    "knowledge-refresh": async (userId) => {
      const r = await drainContextEvents(userId);
      return {
        id: "-",
        status: `refreshed ${r.processed} events → ${r.documents} docs / ${r.chunks} chunks`,
      };
    },
    "knowledge-map": async (userId) => {
      // Refresh entity vectors first so new/edited skills, projects, etc. are
      // linkable, then (re-)map documents. Cheap — SQL + JS only, no LLM calls
      // anywhere in this pipeline. Paginates through *every* current document
      // (no row-count cap) but skips one that's already seen both its own
      // latest edit and the current entity corpus — steady-state runs only do
      // work on what's actually new or changed. Bounded by wall-clock time,
      // not a row limit, to stay under the function timeout.
      await backfillEntityEmbeddings(userId);
      const watermark = await getEntityWatermark(userId);

      const deadline = Date.now() + 50_000;
      let cursor: string | null = null;
      let scanned = 0;
      let mapped = 0;
      let skipped = 0;
      let links = 0;
      let accepted = 0;

      while (Date.now() < deadline) {
        const page = await listDocumentsForMapping(userId, { cursor, limit: 50 });
        if (page.items.length === 0) break;

        for (const d of page.items) {
          if (Date.now() >= deadline) break;
          scanned++;
          const stale =
            !d.lastMappedAt || d.lastMappedAt < d.updatedAt || d.lastMappedAt < watermark;
          if (!stale) {
            skipped++;
            continue;
          }
          const r = await mapDocument(userId, d.id);
          mapped++;
          links += r.inserted;
          accepted += r.autoAccepted;
        }

        cursor = page.nextCursor;
        if (!cursor) break;
      }

      return {
        id: "-",
        status: `scanned ${scanned} doc(s), mapped ${mapped}, skipped ${skipped} unchanged → ${links} link(s), ${accepted} auto-accepted`,
      };
    },
  };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  const { job } = await params;

  const auth = req.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const handler = JOBS[job];
  if (!handler) {
    return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 404 });
  }

  await warmupDb();
  const userId = await getOwnerUserId();
  const runId = await recordCronStart(userId, job);

  try {
    const result = await handler(userId);
    await recordCronFinish(runId, { status: "ok", summary: result.status });
    return NextResponse.json({ ok: true, job, ...result });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await recordCronFinish(runId, { status: "error", error });
    return NextResponse.json({ ok: false, job, error }, { status: 500 });
  }
}
