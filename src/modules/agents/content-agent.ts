import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  dsaAttempts,
  learningSessions,
  projectFeatures,
} from "@/lib/db/schema";
import { hasProviderKey, resolveModelConfig, runStructured } from "@/lib/llm";
import {
  createIdea,
  getContentItem,
  getContentSnapshot,
  hasItemForSource,
  updateContentItem,
  type SourceType,
} from "@/modules/content/service";
import { BaseAgent } from "./base-agent";
import {
  ContentOpportunitiesSchema,
  LinkedInDraftSchema,
} from "./content-schemas";
import type { AgentContext, AgentResult } from "./types";

export interface ContentAgentResult {
  mode: "scan" | "draft";
  source: "ai" | "deterministic";
  model: string | null;
  cached: boolean;
  generatedAt: string;
  note?: string;
  /** scan mode */
  created?: { title: string; hook: string }[];
  /** draft mode */
  contentItemId?: string;
}

interface Candidate {
  key: string;
  type: SourceType;
  id: string;
  label: string;
  detail: string;
}

type Context =
  | { mode: "scan"; candidates: Candidate[] }
  | {
      mode: "draft";
      itemId: string;
      title: string;
      hook: string | null;
      angle: string | null;
      currentBody: string | null;
      grounding: string[];
    };

const SCAN_SYSTEM = `You are the Content Agent for one senior engineer who builds in public on LinkedIn.
From the list of REAL recent events, pick the 2-5 that would make a genuinely useful post (a lesson, a non-obvious decision, a bug, a pattern insight). Skip anything that would only be humble-bragging or generic motivation.
For each: a specific title, a one-line hook, and the angle the post should take. Reference the event by its key. Never invent events.`;

const DRAFT_SYSTEM = `You write first-person "build in public" LinkedIn posts for a senior backend/full-stack engineer.
Rules: specific and concrete, grounded ONLY in the provided facts; 110-220 words; a strong first line; plain language, no emoji storms, at most 2 hashtags; end with a takeaway or a question. Never fabricate details not in the grounding.`;

// ── helpers ────────────────────────────────────────────────────────────────

function buildCandidates(
  snap: Awaited<ReturnType<typeof getContentSnapshot>>,
): Candidate[] {
  const out: Candidate[] = [];
  snap.sessions.forEach((s, i) =>
    out.push({
      key: `LS${i + 1}`,
      type: "learning_session",
      id: s.id,
      label: `Studied: ${s.topic}`,
      detail: [
        s.category,
        s.description ?? "",
        s.confidenceBefore != null && s.confidenceAfter != null
          ? `confidence ${s.confidenceBefore}→${s.confidenceAfter}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
    }),
  );
  snap.features.forEach((f, i) =>
    out.push({
      key: `PF${i + 1}`,
      type: "project_feature",
      id: f.id,
      label: `Shipped: ${f.title} (${f.project})`,
      detail: f.description ?? "",
    }),
  );
  snap.dsa
    .filter((d) => d.notes || d.failureReason === "could_not_identify_pattern")
    .forEach((d, i) =>
      out.push({
        key: `DSA${i + 1}`,
        type: "dsa_attempt",
        id: d.id,
        label: `DSA: ${d.title} (${d.solved ? "solved" : "unsolved"})`,
        detail: [
          d.failureReason !== "none" ? d.failureReason : "",
          d.notes ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
      }),
    );
  snap.levelups.forEach((l, i) =>
    out.push({
      key: `SK${i + 1}`,
      type: "skill_levelup",
      id: l.id,
      label: `Skill evidence: ${l.skill} → ${l.supportsLevel}`,
      detail: l.summary,
    }),
  );
  return out;
}

async function enrichForDraft(
  userId: string,
  sources: { sourceType: string; sourceId: string | null; note: string | null }[],
): Promise<string[]> {
  const out: string[] = [];
  for (const s of sources) {
    if (s.note) out.push(s.note);
    if (!s.sourceId) continue;
    if (s.sourceType === "project_feature") {
      const [f] = await db
        .select({ title: projectFeatures.title, description: projectFeatures.description })
        .from(projectFeatures)
        .where(
          and(
            eq(projectFeatures.userId, userId),
            eq(projectFeatures.id, s.sourceId),
          ),
        )
        .limit(1);
      if (f) out.push(`Feature "${f.title}": ${f.description ?? "(no description)"}`);
    } else if (s.sourceType === "learning_session") {
      const [l] = await db
        .select({ topic: learningSessions.topic, description: learningSessions.description })
        .from(learningSessions)
        .where(
          and(
            eq(learningSessions.userId, userId),
            eq(learningSessions.id, s.sourceId),
          ),
        )
        .limit(1);
      if (l) out.push(`Learning "${l.topic}": ${l.description ?? ""}`);
    } else if (s.sourceType === "dsa_attempt") {
      const [d] = await db
        .select({ notes: dsaAttempts.notes, failureReason: dsaAttempts.failureReason })
        .from(dsaAttempts)
        .where(
          and(eq(dsaAttempts.userId, userId), eq(dsaAttempts.id, s.sourceId)),
        )
        .limit(1);
      if (d) out.push(`DSA note: ${d.notes ?? ""} (${d.failureReason})`);
    }
  }
  return [...new Set(out.filter(Boolean))];
}

// ── agent ──────────────────────────────────────────────────────────────────

export class ContentAgent extends BaseAgent<Context, ContentAgentResult> {
  readonly name = "content" as const;

  protected async gatherContext(ctx: AgentContext): Promise<Context> {
    const contentItemId = ctx.input.contentItemId
      ? String(ctx.input.contentItemId)
      : null;

    if (contentItemId) {
      const got = await getContentItem(ctx.userId, contentItemId);
      if (!got) throw new Error("Content item not found.");
      const grounding = await enrichForDraft(ctx.userId, got.sources);
      return {
        mode: "draft",
        itemId: contentItemId,
        title: got.item.title,
        hook: got.item.hook,
        angle: got.item.angle,
        currentBody: got.item.body,
        grounding,
      };
    }

    const snap = await getContentSnapshot(ctx.userId);
    const candidates = buildCandidates(snap);
    const fresh: Candidate[] = [];
    for (const c of candidates) {
      if (!(await hasItemForSource(ctx.userId, c.type, c.id))) fresh.push(c);
    }
    return { mode: "scan", candidates: fresh };
  }

  protected async analyze(
    ctx: AgentContext,
    context: Context,
  ): Promise<ContentAgentResult> {
    const today = new Date().toISOString().slice(0, 10);
    const cfg = await resolveModelConfig(ctx.userId, "content");
    const noKey = !hasProviderKey(cfg.provider) || cfg.exhausted;

    if (context.mode === "draft") {
      if (noKey) {
        const body = [
          context.hook ?? context.title,
          "",
          ...context.grounding,
          "",
          "(Draft the rest yourself — no AI key configured.)",
        ].join("\n");
        await updateContentItem(ctx.userId, context.itemId, {
          body,
          status: "draft",
        });
        return {
          mode: "draft",
          contentItemId: context.itemId,
          source: "deterministic",
          model: null,
          cached: false,
          generatedAt: today,
          note: `${cfg.provider.toUpperCase()}_API_KEY not configured.`,
        };
      }

      const { data, cached, model } = await runStructured({
        userId: ctx.userId,
        agent: "content",
        agentRunId: ctx.agentRunId,
        schema: LinkedInDraftSchema,
        schemaName: "linkedin_draft",
        system: DRAFT_SYSTEM,
        prompt: [
          `Working title: ${context.title}`,
          context.hook ? `Hook: ${context.hook}` : "",
          context.angle ? `Angle: ${context.angle}` : "",
          ``,
          `Grounding facts (use only these):`,
          ...context.grounding.map((g) => `- ${g}`),
          context.currentBody ? `\nExisting draft to improve:\n${context.currentBody}` : "",
          ``,
          `Write the LinkedIn post.`,
        ]
          .filter(Boolean)
          .join("\n"),
        temperature: 0.6,
      });

      await updateContentItem(ctx.userId, context.itemId, {
        title: data.title,
        body: data.body,
        status: "draft",
      });
      return {
        mode: "draft",
        contentItemId: context.itemId,
        source: "ai",
        model,
        cached,
        generatedAt: today,
      };
    }

    // scan mode
    if (context.candidates.length === 0) {
      return {
        mode: "scan",
        source: "deterministic",
        model: null,
        cached: false,
        generatedAt: today,
        created: [],
        note: "No new real activity to write about yet.",
      };
    }

    if (noKey) {
      // deterministic: turn the top 3 candidates straight into ideas
      const picks = context.candidates.slice(0, 3);
      const created: { title: string; hook: string }[] = [];
      for (const c of picks) {
        await createIdea(ctx.userId, {
          title: c.label,
          hook: c.detail || c.label,
          angle: "What I learned / what was non-obvious.",
          agentRunId: ctx.agentRunId,
          sources: [{ sourceType: c.type, sourceId: c.id, note: c.label }],
        });
        created.push({ title: c.label, hook: c.detail || c.label });
      }
      return {
        mode: "scan",
        source: "deterministic",
        model: null,
        cached: false,
        generatedAt: today,
        created,
        note: `${cfg.provider.toUpperCase()}_API_KEY not configured — raw ideas from recent activity.`,
      };
    }

    const { data, model, cached } = await runStructured({
      userId: ctx.userId,
      agent: "content",
      agentRunId: ctx.agentRunId,
      schema: ContentOpportunitiesSchema,
      schemaName: "content_opportunities",
      system: SCAN_SYSTEM,
      prompt: [
        `Recent real events:`,
        ...context.candidates.map(
          (c) => `[${c.key}] ${c.label}${c.detail ? ` — ${c.detail}` : ""}`,
        ),
        ``,
        `Pick the best 2-5 and return content opportunities.`,
      ].join("\n"),
      temperature: 0.5,
      cache: false,
    });

    const byKey = new Map(context.candidates.map((c) => [c.key, c]));
    const created: { title: string; hook: string }[] = [];
    for (const o of data.opportunities) {
      const c = byKey.get(o.sourceKey);
      if (!c) continue;
      await createIdea(ctx.userId, {
        title: o.title,
        hook: o.hook,
        angle: o.angle,
        agentRunId: ctx.agentRunId,
        sources: [{ sourceType: c.type, sourceId: c.id, note: c.label }],
      });
      created.push({ title: o.title, hook: o.hook });
    }

    return {
      mode: "scan",
      source: "ai",
      model,
      cached,
      generatedAt: today,
      created,
    };
  }

  protected async buildRecommendations(
    _ctx: AgentContext,
    _context: Context,
    analysis: ContentAgentResult,
  ): Promise<AgentResult> {
    return {
      result: analysis,
      summary:
        analysis.mode === "draft"
          ? "Draft written"
          : `${analysis.created?.length ?? 0} content idea(s) created`,
      needsApproval: false,
    };
  }
}

export const contentAgent = new ContentAgent();
