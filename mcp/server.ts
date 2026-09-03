/**
 * Personal Context MCP server (stdio, read-only).
 *
 * A thin adapter over the same engine the in-app agents use — every tool
 * response spans both the structured tables and the pgvector knowledge base.
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
import { searchKnowledge } from "@/lib/knowledge";
import { getOwnerUserId } from "@/lib/owner";
import { CONTEXT_PURPOSES, getPersonalContext } from "@/modules/context";
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

async function main() {
  await warmupDb();
  await server.connect(new StdioServerTransport());
  // stays alive on stdio until the client disconnects
}

main().catch((e) => {
  console.error("[personal-context mcp]", e);
  process.exit(1);
});
