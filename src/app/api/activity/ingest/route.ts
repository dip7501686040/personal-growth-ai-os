import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestActivity, resolveIngestToken } from "@/modules/activity/service";

export const maxDuration = 30;

const payloadSchema = z.object({
  clientEventId: z.uuid(),
  source: z.literal("claude_code").optional(),
  eventType: z.literal("coding_session").optional(),
  sessionId: z.string().max(200).optional(),
  projectPath: z.string().max(1000).optional(),
  projectName: z.string().max(300).optional(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  durationSeconds: z.number().min(0).max(60 * 60 * 24),
  files: z.object({
    created: z.array(z.string().max(1000)).max(2000).default([]),
    modified: z.array(z.string().max(1000)).max(2000).default([]),
    deleted: z.array(z.string().max(1000)).max(2000).default([]),
  }),
  git: z.object({
    branch: z.string().max(300).optional(),
    commits: z
      .array(
        z.object({
          hash: z.string().max(64),
          message: z.string().max(2000),
        }),
      )
      .max(200)
      .default([]),
    stats: z
      .object({
        filesChanged: z.number().int().min(0).default(0),
        insertions: z.number().int().min(0).default(0),
        deletions: z.number().int().min(0).default(0),
      })
      .default({ filesChanged: 0, insertions: 0, deletions: 0 }),
  }),
  sessionSummary: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const userId = await resolveIngestToken(token);
  if (!userId) {
    return NextResponse.json({ error: "Invalid or revoked token" }, { status: 401 });
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

  try {
    const result = await ingestActivity(userId, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ingest failed" },
      { status: 500 },
    );
  }
}
