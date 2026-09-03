import { hasProviderKey, resolveModelConfig, runStructured } from "@/lib/llm";
import { getPersonalContext } from "@/modules/context";
import {
  createOpportunity,
  getBusinessSnapshot,
  titleExists,
  type OpportunityInput,
} from "@/modules/business/service";
import { BaseAgent } from "./base-agent";
import { BusinessOpportunitiesSchema } from "./business-schema";
import type { AgentContext, AgentResult } from "./types";

export interface BusinessAgentResult {
  source: "ai" | "deterministic";
  model: string | null;
  cached: boolean;
  generatedAt: string;
  created: { title: string; skillMatchScore: number }[];
  note?: string;
}

interface Context {
  snapshot: Awaited<ReturnType<typeof getBusinessSnapshot>>;
  market: string;
  businessType: string;
  knownProblems: string;
  /** Unified skill + knowledge-base view from the Personal Context Engine. */
  personal: string;
}

const SYSTEM = `You are the Business Opportunity Agent for one senior backend/full-stack engineer who wants realistic side income.

Hard constraints:
- Only propose software/AI products a SOLO developer can build in 1-4 weeks and sell to a small or local business.
- No VC startups, no marketplaces or anything needing network effects, no ideas needing a team, hardware, inventory, or capital.
- The tech stack MUST be drawn from the user's proven/implemented skills (list provided). If an idea needs a skill they don't have, drop it or simplify it.
- skillMatchScore = how much of the build the user can do TODAY with proven skills (be honest; 60 means a real learning gap).
- complexity: "low" = a weekend, "medium" = 1-2 weeks, "high" = 3-4 weeks.
- buildScope: one line, concrete ("~1 week: WhatsApp webhook, booking table, admin page, reminder cron").
- monetizationModel: realistic for a small business (e.g. "₹1500-3000/mo + ₹5000 setup" or "one-time ₹15000 build").
- Prefer the user's market / business type / known problems if given.`;

function buildPrompt(ctx: Context, today: string): string {
  return [
    `Today: ${today}`,
    ``,
    `# The engineer's current context`,
    ctx.personal,
    ``,
    `User can build with (proven/implemented): ${JSON.stringify(ctx.snapshot.buildableWith)}`,
    `Also knows (practiced): ${JSON.stringify(ctx.snapshot.alsoKnows)}`,
    `Has shipped: ${JSON.stringify(ctx.snapshot.projects)}`,
    ``,
    `Market / location: ${ctx.market || "(not specified — assume small & local businesses)"}`,
    `Business type focus: ${ctx.businessType || "(any small business)"}`,
    `Known problems to target: ${ctx.knownProblems || "(none given)"}`,
    ``,
    `Return 3-5 realistic, solo-buildable opportunities.`,
  ].join("\n");
}

const TEMPLATES: {
  title: string;
  problem: string;
  targetCustomer: string;
  proposedSolution: string;
  needs: string[];
  complexity: "low" | "medium" | "high";
  buildScope: string;
  monetizationModel: string;
}[] = [
  {
    title: "WhatsApp inquiry & booking automation",
    problem: "Small clinics/salons handle appointment requests manually over WhatsApp and lose leads after hours.",
    targetCustomer: "Single-location clinics, salons, tutors",
    proposedSolution: "WhatsApp Cloud API bot that captures inquiries, books slots against an availability table, and sends reminders.",
    needs: ["Node.js", "PostgreSQL", "REST API Design"],
    complexity: "medium",
    buildScope: "~1-2 weeks: WhatsApp webhook, slot model, admin page, reminder cron.",
    monetizationModel: "Monthly subscription + one-time setup fee.",
  },
  {
    title: "AI FAQ / support bot for a business website",
    problem: "Small businesses get the same 20 questions and answer them by hand.",
    targetCustomer: "Local service businesses with a website",
    proposedSolution: "Embeddable chat widget backed by the business's own docs; answers common questions, hands off to WhatsApp/email for the rest.",
    needs: ["Node.js", "OpenAI API", "Next.js"],
    complexity: "medium",
    buildScope: "~2 weeks: doc ingestion, retrieval, widget, handoff, simple analytics.",
    monetizationModel: "Monthly subscription tiered by message volume.",
  },
  {
    title: "Inventory / stock dashboard",
    problem: "Retailers track stock in spreadsheets and run out of fast-movers.",
    targetCustomer: "Kirana stores, small retailers, cafes",
    proposedSolution: "Simple web app: items, stock levels, low-stock alerts, purchase list; CSV import.",
    needs: ["Next.js", "PostgreSQL", "React"],
    complexity: "low",
    buildScope: "~1 week: CRUD, alerts, CSV import, one dashboard.",
    monetizationModel: "Low monthly subscription per location.",
  },
  {
    title: "Notification / reminder automation service",
    problem: "Businesses forget to follow up with customers (renewals, payments, appointments).",
    targetCustomer: "Gyms, subscription services, service shops",
    proposedSolution: "Rules + scheduler that sends SMS/WhatsApp/email reminders from a customer list; templates and logs.",
    needs: ["Node.js", "RabbitMQ", "PostgreSQL", "Event-Driven Architecture"],
    complexity: "medium",
    buildScope: "~2 weeks: customer import, rule builder, queue + scheduler, delivery logs.",
    monetizationModel: "Subscription + usage-based messaging.",
  },
];

function deterministicOpportunities(ctx: Context): OpportunityInput[] {
  const have = new Set(
    [...ctx.snapshot.buildableWith, ...ctx.snapshot.alsoKnows].map((x) =>
      x.toLowerCase(),
    ),
  );
  return TEMPLATES.map((t) => {
    const covered = t.needs.filter((n) => have.has(n.toLowerCase()));
    const score = Math.round((covered.length / t.needs.length) * 90) + 5;
    return {
      title: t.title,
      problem: t.problem,
      targetCustomer: t.targetCustomer,
      proposedSolution: t.proposedSolution,
      techStack: covered.length ? covered : t.needs,
      skillMatchScore: Math.min(95, score),
      complexity: t.complexity,
      buildScope: t.buildScope,
      monetizationModel: t.monetizationModel,
      market: ctx.market || undefined,
      businessType: ctx.businessType || undefined,
    };
  });
}

export class BusinessAgent extends BaseAgent<Context, BusinessAgentResult> {
  readonly name = "business" as const;

  protected async gatherContext(ctx: AgentContext): Promise<Context> {
    const [snapshot, pc] = await Promise.all([
      getBusinessSnapshot(ctx.userId),
      getPersonalContext({ userId: ctx.userId, purpose: "business_scan" }),
    ]);
    return {
      snapshot,
      market: String(ctx.input.market ?? "").trim(),
      businessType: String(ctx.input.businessType ?? "").trim(),
      knownProblems: String(ctx.input.knownProblems ?? "").trim(),
      personal: pc.toPromptString(),
    };
  }

  protected async analyze(
    ctx: AgentContext,
    context: Context,
  ): Promise<BusinessAgentResult> {
    const today = new Date().toISOString().slice(0, 10);
    const cfg = await resolveModelConfig(ctx.userId, "business");

    if (!hasProviderKey(cfg.provider) || cfg.exhausted) {
      await ctx.log(`${cfg.provider} API key not set — template opportunities`, {
        level: "warn",
        step: "analyzing",
      });
      const created: BusinessAgentResult["created"] = [];
      for (const opp of deterministicOpportunities(context)) {
        if (await titleExists(ctx.userId, opp.title)) continue;
        await createOpportunity(ctx.userId, { ...opp, agentRunId: ctx.agentRunId });
        created.push({
          title: opp.title,
          skillMatchScore: opp.skillMatchScore ?? 0,
        });
      }
      return {
        source: "deterministic",
        model: null,
        cached: false,
        generatedAt: today,
        created,
        note: `Set ${cfg.provider.toUpperCase()}_API_KEY for tailored ideas.`,
      };
    }

    const { data, model, cached } = await runStructured({
      userId: ctx.userId,
      agent: "business",
      agentRunId: ctx.agentRunId,
      schema: BusinessOpportunitiesSchema,
      schemaName: "business_opportunities",
      signal: ctx.signal,
      system: SYSTEM,
      prompt: buildPrompt(context, today),
      temperature: 0.5,
      cache: false,
    });

    const created: BusinessAgentResult["created"] = [];
    for (const o of data.opportunities) {
      if (await titleExists(ctx.userId, o.title)) continue;
      await createOpportunity(ctx.userId, {
        title: o.title,
        problem: o.problem,
        targetCustomer: o.targetCustomer,
        proposedSolution: o.proposedSolution,
        techStack: o.techStack,
        skillMatchScore: o.skillMatchScore,
        complexity: o.complexity,
        buildScope: o.buildScope,
        monetizationModel: o.monetizationModel,
        market: context.market || undefined,
        businessType: context.businessType || undefined,
        agentRunId: ctx.agentRunId,
      });
      created.push({ title: o.title, skillMatchScore: o.skillMatchScore });
    }

    return { source: "ai", model, cached, generatedAt: today, created };
  }

  protected async buildRecommendations(
    _ctx: AgentContext,
    _context: Context,
    analysis: BusinessAgentResult,
  ): Promise<AgentResult> {
    return {
      result: analysis,
      summary: `${analysis.created.length} opportunity/ies created`,
      needsApproval: false,
    };
  }
}

export const businessAgent = new BusinessAgent();
