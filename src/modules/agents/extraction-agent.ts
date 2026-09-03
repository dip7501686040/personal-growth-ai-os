import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import type { IngestionJob } from "@/lib/db/schema";
import { embedDocument, upsertDocumentRow } from "@/lib/knowledge";
import { runStructured } from "@/lib/llm";
import {
  CanonicalKnowledgeSchema,
  isEmptyCanonical,
  type CanonicalKnowledge,
} from "@/modules/ingestion/canonical";
import {
  claimJob,
  claimNextJob,
  completeJob,
  failJob,
} from "@/modules/ingestion/queue";
import { addEvidence, upsertSkillByName } from "@/modules/skills/service";
import { upsertProjectByName } from "@/modules/projects/service";
import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult } from "./types";

// ── job payload ────────────────────────────────────────────────────────────

const JobPayload = z.object({
  text: z.string().min(1),
  title: z.string().optional(),
  /** knowledge_documents.source_kind */
  sourceKind: z.string().default("upload"),
  /** stable pointer for knowledge_documents.source_ref */
  sourceRef: z.string().optional(),
  /** skill_evidence.source_type for anything this job produces */
  evidenceSourceType: z
    .enum(["github_repo", "conversation", "linkedin", "local_doc"])
    .default("local_doc"),
});
type JobPayloadT = z.infer<typeof JobPayload>;

interface ExtractionContext {
  job: IngestionJob | null;
  payload: JobPayloadT | null;
  normalized: string;
}

export interface ExtractionResult {
  skipped?: boolean;
  jobId?: string;
  summary: string;
  documents: number;
  skillSignals: number;
  projects: number;
  attempts: number;
  failedValidation?: boolean;
}

const SYSTEM = `You distil raw engineering material (a repo README, a document, a chat transcript) into a canonical knowledge record for one senior engineer's personal context system.
Rules:
- Extract only what the source actually shows. No speculation, no filler.
- skills[].evidence must quote or point at the concrete thing in the source.
- skills[].confidence: 0.8+ only when the source clearly demonstrates hands-on use; 0.3–0.6 for a mention.
- For every meaningful decision, concept, and learning you list under entities, ALSO add a matching documents[] entry (docType decision/concept/learning) with a self-contained 2–8 sentence body.
- documents[] is what gets embedded for retrieval — make each entry stand alone.
- If the source contains nothing worth keeping, return empty arrays.`;

function buildPrompt(context: ExtractionContext, feedback: string): string {
  return [
    context.payload?.title ? `Source title: ${context.payload.title}` : "",
    `Source kind: ${context.payload?.sourceKind ?? "upload"}`,
    feedback ? `\nFix from the previous attempt: ${feedback}\n` : "",
    `--- SOURCE ---`,
    context.normalized,
    `--- END SOURCE ---`,
    ``,
    `Produce the canonical knowledge record.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const slugish = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "doc";

// ── LangGraph state ────────────────────────────────────────────────────────

type Verdict = "ok" | "retry" | "fail";
interface Outcome {
  documents: number;
  skillSignals: number;
  projects: number;
  toEmbed: { id: string; body: string }[];
}

const one =
  <T>() =>
  (_prev: T, next: T): T =>
    next;

const State = Annotation.Root({
  canonical: Annotation<CanonicalKnowledge | null>({
    reducer: one<CanonicalKnowledge | null>(),
    default: () => null,
  }),
  attempts: Annotation<number>({ reducer: one<number>(), default: () => 0 }),
  feedback: Annotation<string>({ reducer: one<string>(), default: () => "" }),
  verdict: Annotation<Verdict>({ reducer: one<Verdict>(), default: () => "ok" }),
  outcome: Annotation<Outcome | null>({
    reducer: one<Outcome | null>(),
    default: () => null,
  }),
});
type GraphState = typeof State.State;

// ── Agent ──────────────────────────────────────────────────────────────────

export class ExtractionAgent extends BaseAgent<
  ExtractionContext,
  ExtractionResult
> {
  readonly name = "extractor" as const;

  protected async gatherContext(
    ctx: AgentContext,
  ): Promise<ExtractionContext> {
    const jobId =
      typeof ctx.input.jobId === "string" ? ctx.input.jobId : undefined;
    const job = jobId
      ? await claimJob(ctx.userId, jobId)
      : await claimNextJob(ctx.userId);

    if (!job) return { job: null, payload: null, normalized: "" };

    const parsed = JobPayload.safeParse(job.payload);
    if (!parsed.success) {
      await failJob(job.id, `bad job payload: ${parsed.error.message}`);
      await ctx.log(`Skipped job ${job.id} — bad payload`, {
        level: "warn",
        step: "gathering_context",
      });
      return { job: null, payload: null, normalized: "" };
    }

    const normalized = parsed.data.text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 24_000);

    await ctx.log(
      `Job ${job.id} (${job.kind}) — ${normalized.length} chars`,
      { step: "gathering_context" },
    );
    return { job, payload: parsed.data, normalized };
  }

  protected async analyze(
    ctx: AgentContext,
    context: ExtractionContext,
  ): Promise<ExtractionResult> {
    if (!context.job || !context.payload) {
      return {
        skipped: true,
        summary: "No pending ingestion jobs",
        documents: 0,
        skillSignals: 0,
        projects: 0,
        attempts: 0,
      };
    }

    const graph = this.buildGraph(ctx, context);

    try {
      const final = (await graph.invoke(
        {},
        { recursionLimit: 12 },
      )) as GraphState;

      if (final.verdict === "fail") {
        await failJob(
          context.job.id,
          `validation failed after ${final.attempts + 1} attempts`,
        );
        return {
          jobId: context.job.id,
          summary: "Extraction failed validation",
          documents: 0,
          skillSignals: 0,
          projects: 0,
          attempts: final.attempts + 1,
          failedValidation: true,
        };
      }

      const o = final.outcome ?? {
        documents: 0,
        skillSignals: 0,
        projects: 0,
        toEmbed: [],
      };
      const result: ExtractionResult = {
        jobId: context.job.id,
        summary: final.canonical?.summary ?? "Nothing extracted",
        documents: o.documents,
        skillSignals: o.skillSignals,
        projects: o.projects,
        attempts: final.attempts + 1,
      };
      await completeJob(context.job.id, { ...result });
      return result;
    } catch (err) {
      await failJob(
        context.job.id,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  }

  protected async buildRecommendations(
    _ctx: AgentContext,
    _context: ExtractionContext,
    analysis: ExtractionResult,
  ): Promise<AgentResult> {
    return {
      result: analysis,
      summary: analysis.skipped
        ? analysis.summary
        : analysis.failedValidation
          ? `Job ${analysis.jobId} failed validation`
          : `Ingested ${analysis.documents} docs, ${analysis.skillSignals} skill signals, ${analysis.projects} projects`,
      needsApproval: false,
    };
  }

  // ── the workflow ─────────────────────────────────────────────────────────

  private buildGraph(ctx: AgentContext, context: ExtractionContext) {
    const payload = context.payload!;
    const job = context.job!;

    const classify = async (): Promise<Partial<GraphState>> => {
      await ctx.log(
        `classify: sourceKind=${payload.sourceKind}, evidence=${payload.evidenceSourceType}`,
        { step: "analyzing" },
      );
      return {};
    };

    const extract = async (
      state: GraphState,
    ): Promise<Partial<GraphState>> => {
      const { data } = await runStructured({
        userId: ctx.userId,
        agent: "extractor",
        agentRunId: ctx.agentRunId,
        schema: CanonicalKnowledgeSchema,
        schemaName: "canonical_knowledge",
        signal: ctx.signal,
        system: SYSTEM,
        prompt: buildPrompt(context, state.feedback),
        temperature: 0.2,
      });
      return { canonical: data };
    };

    const validate = async (
      state: GraphState,
    ): Promise<Partial<GraphState>> => {
      const c = state.canonical;
      const problems: string[] = [];
      if (!c || isEmptyCanonical(c)) problems.push("nothing was extracted");
      if (c?.entities.skills.some((s) => !s.name.trim())) {
        problems.push("a skill has a blank name");
      }
      if (c?.documents.some((d) => d.body.trim().length < 20)) {
        problems.push("a document body is too short to be useful");
      }

      if (problems.length === 0) {
        await ctx.log("validate: ok", { step: "analyzing" });
        return { verdict: "ok" };
      }
      if (state.attempts >= 2) {
        await ctx.log(`validate: giving up — ${problems.join("; ")}`, {
          level: "warn",
          step: "analyzing",
        });
        return { verdict: "fail" };
      }
      await ctx.log(`validate: retrying — ${problems.join("; ")}`, {
        level: "warn",
        step: "analyzing",
      });
      return {
        verdict: "retry",
        attempts: state.attempts + 1,
        feedback: `The previous attempt had: ${problems.join("; ")}.`,
      };
    };

    const reconcile = async (
      state: GraphState,
    ): Promise<Partial<GraphState>> => {
      const n = state.canonical?.documents.length ?? 0;
      await ctx.log(`reconcile: ${n} candidate documents`, { step: "analyzing" });
      return {};
    };

    const persist = async (
      state: GraphState,
    ): Promise<Partial<GraphState>> => {
      const c = state.canonical!;
      let skillSignals = 0;
      for (const s of c.entities.skills) {
        const skill = await upsertSkillByName(ctx.userId, s.name, s.category);
        await addEvidence(ctx.userId, skill.id, {
          summary: s.evidence.slice(0, 400),
          sourceType: payload.evidenceSourceType,
          // External, unverified — the weakest tier. The user accepts to promote.
          supportsLevel: "learning",
          strength: s.confidence >= 0.75 ? "moderate" : "weak",
          status: "suggested",
          createdBy: "agent",
          agentRunId: ctx.agentRunId,
        });
        skillSignals++;
      }

      let projects = 0;
      for (const p of c.entities.projects) {
        await upsertProjectByName(ctx.userId, p.name, p.description);
        projects++;
      }

      const toEmbed: { id: string; body: string }[] = [];
      for (const d of c.documents) {
        const { document, created } = await upsertDocumentRow({
          userId: ctx.userId,
          docType: d.docType,
          title: d.title,
          body: d.body,
          sourceKind: payload.sourceKind,
          sourceRef: `${payload.sourceRef ?? job.dedupeKey ?? job.id}#${slugish(d.title)}`,
          meta: { jobId: job.id, agentRunId: ctx.agentRunId },
        });
        if (created) toEmbed.push({ id: document.id, body: d.body });
      }

      await ctx.log(
        `persist: ${skillSignals} skill signals, ${projects} projects, ${toEmbed.length} new documents`,
        { step: "analyzing" },
      );
      return {
        outcome: { documents: c.documents.length, skillSignals, projects, toEmbed },
      };
    };

    const embed = async (
      state: GraphState,
    ): Promise<Partial<GraphState>> => {
      let chunks = 0;
      for (const { id, body } of state.outcome?.toEmbed ?? []) {
        chunks += await embedDocument(ctx.userId, id, body);
      }
      await ctx.log(`embed: ${chunks} chunks`, { step: "analyzing" });
      return {};
    };

    return new StateGraph(State)
      .addNode("classify", classify)
      .addNode("extract", extract)
      .addNode("validate", validate)
      .addNode("reconcile", reconcile)
      .addNode("persist", persist)
      .addNode("embed", embed)
      .addEdge(START, "classify")
      .addEdge("classify", "extract")
      .addEdge("extract", "validate")
      .addConditionalEdges(
        "validate",
        (state: GraphState) => state.verdict,
        { ok: "reconcile", retry: "extract", fail: END },
      )
      .addEdge("reconcile", "persist")
      .addEdge("persist", "embed")
      .addEdge("embed", END)
      .compile();
  }
}

export const extractionAgent = new ExtractionAgent();
