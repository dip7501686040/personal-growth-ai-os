import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveIngestToken } from "@/modules/activity/service";
import { upsertSessionJob } from "@/modules/ingestion/queue";

export const maxDuration = 30;

/**
 * Claude Code transcript ingestion. The local collector (opt-in via
 * PGAIOS_SYNC_TRANSCRIPTS) posts trimmed user+assistant prose here; it lands
 * as an `ingestion_jobs` row that the Extraction Agent later distils.
 * Same Bearer-token scheme as /api/activity/ingest.
 */
const payloadSchema = z.object({
  sessionId: z.string().min(1).max(200),
  title: z.string().max(300).optional(),
  text: z.string().min(20).max(200_000),
});

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const userId = await resolveIngestToken(token);
  if (!userId) {
    return NextResponse.json(
      { error: "Invalid or revoked token" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues.slice(0, 10) },
      { status: 400 },
    );
  }
  const { sessionId, title, text } = parsed.data;

  try {
    // One queue row per session — later (longer) snapshots fold into it rather
    // than piling up a job per message.
    const { job, action } = await upsertSessionJob({
      userId,
      kind: "claude_transcript",
      dedupeKey: `claude:${sessionId}`,
      payload: {
        text,
        title: title ?? `Claude Code session ${sessionId.slice(0, 8)}`,
        sourceKind: "claude_transcripts",
        sourceRef: `claude:${sessionId}`,
        evidenceSourceType: "conversation",
      },
    });
    return NextResponse.json({ ok: true, jobId: job.id, action });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ingest failed" },
      { status: 500 },
    );
  }
}
