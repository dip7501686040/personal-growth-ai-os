/**
 * Personal Context MCP server (stdio).
 *
 * A thin adapter over the same modules the in-app agents use. Reads span the
 * structured tables + the pgvector knowledge base; the `*_application` /
 * `*_touchpoint` tools also write the job-application ledger (Track J) — the
 * only writes this server does, all to the owner's own data.
 *
 * Run (from the repo root so the "@/" tsconfig paths resolve):
 *   node --import tsx --env-file=.env.local mcp/server.ts
 *
 * Wire into Claude Code / Claude Desktop — see mcp/README.md.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { warmupDb } from "@/lib/db";
import {
  applicationStatusEnum,
  touchpointChannelEnum,
  touchpointKindEnum,
} from "@/lib/db/schema";
import { searchKnowledge } from "@/lib/knowledge";
import { getOwnerUserId } from "@/lib/owner";
import {
  listDueFollowups,
  listOpenApplications,
  recordApplication,
  recordTouchpoint,
  setApplicationStatus,
} from "@/modules/applications/service";
import { CONTEXT_PURPOSES, getPersonalContext } from "@/modules/context";
import { getProofForJd } from "@/modules/knowledge/jd-proof";
import { loadMaster, suggestArchetype } from "@/modules/resume/master";
import { SKILL_LEVELS } from "@/modules/skills/levels";
import { listSkills } from "@/modules/skills/service";

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

const server = new McpServer({
  name: "personal-context",
  version: "0.1.0",
});

server.registerTool(
  "get_personal_context",
  {
    description:
      "Assemble the owner's engineering context for a purpose: a structured slice (skills by level, in-progress work, recent learning, activity evidence) plus semantically-retrieved knowledge from their repos, docs and conversations. Use before advising on learning, career, projects, content or business.",
    inputSchema: {
      purpose: z.enum(CONTEXT_PURPOSES),
      query: z
        .string()
        .optional()
        .describe("optional focus for retrieval, e.g. a job description"),
    },
  },
  async ({ purpose, query }) => {
    const userId = await getOwnerUserId();
    const ctx = await getPersonalContext({ userId, purpose, query });
    const refs = ctx.knowledge
      .map((h) => `- [${h.docType}] ${h.title}`)
      .join("\n");
    return text(
      `${ctx.toPromptString()}\n\n---\nknowledge sources used:\n${refs || "(none yet)"}`,
    );
  },
);

server.registerTool(
  "search_knowledge",
  {
    description:
      "Hybrid search over the owner's personal knowledge base (distilled facts from GitHub repos, project docs, ADRs, ChatGPT/Claude conversations). Returns the most relevant chunks.",
    inputSchema: {
      query: z.string(),
      k: z.number().int().min(1).max(20).optional(),
    },
  },
  async ({ query, k }) => {
    const userId = await getOwnerUserId();
    const hits = await searchKnowledge({ userId, query, k: k ?? 8 });
    if (hits.length === 0) return text("No matching knowledge.");
    return text(
      hits
        .map(
          (h) =>
            `## ${h.title}  [${h.docType} · ${h.sourceKind}]\n${h.content}`,
        )
        .join("\n\n"),
    );
  },
);

server.registerTool(
  "list_skills",
  {
    description:
      "The owner's skills with their proven level (interested → learning → practiced → implemented → proven) and confidence. Optionally filter by level.",
    inputSchema: {
      level: z.enum(SKILL_LEVELS).optional(),
    },
  },
  async ({ level }) => {
    const userId = await getOwnerUserId();
    const skills = await listSkills(userId);
    const rows = (level ? skills.filter((s) => s.level === level) : skills).map(
      (s) => ({
        name: s.name,
        level: s.level,
        category: s.category,
        confidence: s.confidence,
      }),
    );
    return text(JSON.stringify(rows, null, 2));
  },
);

server.registerTool(
  "get_proof_for_jd",
  {
    description:
      "Given a job description, return the owner's matching skills (name, level, and the shipped project features that prove each — with repo, demo video and specific code-path links), directly-matched project features, and related published content and learning sessions. Deterministic: embedding + lexical match, then plain SQL — no LLM. Use to assemble a per-JD proof-of-work bundle.",
    inputSchema: {
      jd: z.string().min(1).describe("the full job-description text"),
    },
  },
  async ({ jd }) => {
    const userId = await getOwnerUserId();
    return text(JSON.stringify(await getProofForJd(userId, jd), null, 2));
  },
);

server.registerTool(
  "get_master_resume",
  {
    description:
      "The owner's master résumé (resume/master.json) — full structured data: summary variants, skill groups, experience, projects, education, and the three archetype presets (backend / platform / ai-llm). Pass `jd` to also get the archetype that best fits that job. To render a tailored file, run `pnpm resume <archetype> --jd <file>`.",
    inputSchema: {
      jd: z
        .string()
        .optional()
        .describe("optional JD text — returns the best-fit archetype for it"),
    },
  },
  async ({ jd }) => {
    const master = loadMaster();
    const suggestedArchetype = jd ? suggestArchetype(master, jd) : null;
    return text(JSON.stringify({ master, suggestedArchetype }, null, 2));
  },
);

// ── Job-application ledger (Track J) ──────────────────────────────────────

server.registerTool(
  "record_application",
  {
    description:
      "Record (or refresh) a prepped job in the application ledger. Idempotent on `<company>|<role>` (or an explicit dedupeKey) — call it again to update fields. Status starts at 'draft'; use record_touchpoint('submitted') when you actually apply.",
    inputSchema: {
      company: z.string().min(1),
      role: z.string().min(1),
      dedupeKey: z.string().optional(),
      jdText: z.string().optional(),
      jdUrl: z.string().optional(),
      source: z.string().optional().describe("board it came from, e.g. weworkremotely"),
      portal: z.string().optional().describe("where you'll apply"),
      contactName: z.string().optional(),
      contactChannel: z.enum(touchpointChannelEnum.enumValues).optional(),
      remoteKind: z.enum(["remote", "onsite_foreign", "onsite_india"]).optional(),
      salaryRaw: z.string().optional(),
      salaryLpa: z.number().optional(),
      companyType: z
        .enum(["product", "agency_named_client", "agency_unnamed", "body_shop", "unknown"])
        .optional(),
      fundingStage: z.string().optional(),
      fundingNote: z.string().optional(),
      replyLikelihood: z.number().optional(),
      skillMatch: z.number().optional(),
      matchedSkills: z.array(z.unknown()).optional(),
      matchedFeatures: z.array(z.unknown()).optional(),
      proofBundle: z.array(z.unknown()).optional(),
      flags: z.array(z.string()).optional(),
      bundleDir: z.string().optional().describe("local applications/<date>/<company>__<role>/ folder"),
    },
  },
  async (args) => {
    const userId = await getOwnerUserId();
    const row = await recordApplication(userId, args);
    return text(JSON.stringify({ id: row.id, dedupeKey: row.dedupeKey, status: row.status }, null, 2));
  },
);

server.registerTool(
  "set_application_status",
  {
    description:
      "Move an application to a new status (draft → applied → screening → interviewing → offer/rejected/ghosted).",
    inputSchema: {
      id: z.string().uuid(),
      status: z.enum(applicationStatusEnum.enumValues),
    },
  },
  async ({ id, status }) => {
    const userId = await getOwnerUserId();
    await setApplicationStatus(userId, id, status);
    return text(`ok — ${id} → ${status}`);
  },
);

server.registerTool(
  "record_touchpoint",
  {
    description:
      "Log a message sent about an application (or an interview / note). kind='submitted' also flips a draft to 'applied'. Follow-up cadence is auto-scheduled (day 5 → day 12) unless you pass nextDueAt.",
    inputSchema: {
      applicationId: z.string().uuid(),
      kind: z.enum(touchpointKindEnum.enumValues),
      channel: z.enum(touchpointChannelEnum.enumValues).optional(),
      responseSummary: z.string().optional(),
      note: z.string().optional(),
      nextDueAt: z.string().datetime().optional().describe("ISO; overrides the default cadence"),
    },
  },
  async ({ applicationId, kind, channel, responseSummary, note, nextDueAt }) => {
    const userId = await getOwnerUserId();
    const row = await recordTouchpoint(userId, {
      applicationId,
      kind,
      channel,
      responseSummary,
      note,
      nextDueAt: nextDueAt ? new Date(nextDueAt) : undefined,
    });
    return text(
      JSON.stringify(
        { id: row.id, kind: row.kind, nextDueAt: row.nextDueAt?.toISOString() ?? null },
        null,
        2,
      ),
    );
  },
);

server.registerTool(
  "list_open_applications",
  {
    description:
      "Applications still in play (draft/applied/screening/interviewing), newest first, each with its latest touchpoint. Optionally filter by status.",
    inputSchema: {
      status: z.enum(applicationStatusEnum.enumValues).optional(),
    },
  },
  async ({ status }) => {
    const userId = await getOwnerUserId();
    const rows = await listOpenApplications(userId, status);
    return text(
      JSON.stringify(
        rows.map((r) => ({
          id: r.id,
          company: r.company,
          role: r.role,
          status: r.status,
          skillMatch: r.skillMatch,
          replyLikelihood: r.replyLikelihood,
          bundleDir: r.bundleDir,
          lastTouchpoint: r.lastTouchpoint,
        })),
        null,
        2,
      ),
    );
  },
);

server.registerTool(
  "list_due_followups",
  {
    description:
      "Applications whose scheduled follow-up date has passed and that are still applied/screening — what to nudge today.",
    inputSchema: {},
  },
  async () => {
    const userId = await getOwnerUserId();
    const rows = await listDueFollowups(userId);
    return text(
      JSON.stringify(
        rows.map((r) => ({
          id: r.application.id,
          company: r.application.company,
          role: r.application.role,
          lastKind: r.lastKind,
          dueAt: r.dueAt,
          bundleDir: r.application.bundleDir,
        })),
        null,
        2,
      ),
    );
  },
);

async function main() {
  await warmupDb();
  await server.connect(new StdioServerTransport());
  // stays alive on stdio until the client disconnects
}

main().catch((e) => {
  console.error("[personal-context mcp]", e);
  process.exit(1);
});
