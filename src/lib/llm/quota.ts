import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsage } from "@/lib/db/schema";
import type { ModelChoice } from "./models";

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/**
 * Per-model rate limits from the user's Google AI Studio + OpenAI dashboards
 * (as of 2026-09). Google's free-tier numbers move and vary by model — check
 * https://ai.google.dev/gemini-api/docs/rate-limits and your AI Studio page.
 *   RPM = requests/minute · TPM = tokens/minute · RPD = requests/day · TPD = tokens/day
 * Whichever limit is hit first is the cap.
 */
const GEMINI_LIMITS: Record<string, { rpm: number; tpm: number; rpd: number }> = {
  // premium Flash (free tier): only 20 requests/day
  "gemini-3.8-flash": { rpm: 5, tpm: 250_000, rpd: 20 },
  "gemini-3.6-flash": { rpm: 5, tpm: 250_000, rpd: 20 },
  "gemini-3.5-flash": { rpm: 5, tpm: 250_000, rpd: 20 },
  "gemini-3-flash": { rpm: 5, tpm: 250_000, rpd: 20 },
  "gemini-2.5-flash": { rpm: 5, tpm: 250_000, rpd: 20 },
  // Flash-Lite (free tier): 500 requests/day
  "gemini-3.5-flash-lite": { rpm: 15, tpm: 250_000, rpd: 500 },
  "gemini-3.1-flash-lite": { rpm: 15, tpm: 250_000, rpd: 500 },
  "gemini-flash-lite-latest": { rpm: 15, tpm: 250_000, rpd: 500 },
  "gemini-2.5-flash-lite": { rpm: 10, tpm: 250_000, rpd: 20 },
};

const GEMINI_FALLBACK = {
  rpm: num(process.env.GEMINI_FREE_RPM, 5),
  tpm: num(process.env.GEMINI_FREE_TPM, 250_000),
  rpd: num(process.env.GEMINI_FREE_RPD, 20),
};

const OPENAI_LIMITS: Record<string, { rpm: number; tpm: number; tpd: number }> = {
  "gpt-4.1-mini": { rpm: 500, tpm: 200_000, tpd: 2_000_000 },
  "gpt-4o-mini": { rpm: 500, tpm: 200_000, tpd: 2_000_000 },
  "gpt-5-mini": { rpm: 500, tpm: 500_000, tpd: 5_000_000 },
  "gpt-4.1": { rpm: 500, tpm: 30_000, tpd: 900_000 },
};
const OPENAI_FALLBACK = { rpm: 500, tpm: 200_000, tpd: 2_000_000 };

const OPENAI_BUDGET_USD = num(process.env.OPENAI_BUDGET_USD, 5);

export interface QuotaSummary {
  provider: "gemini" | "openai";
  model: string;
  gemini?: {
    rpd: number;
    rpm: number;
    tpm: number;
    requestsToday: number;
    remainingToday: number;
    runsPerMinute: number;
    avgTokensPerRun: number;
  };
  openai?: {
    budgetUsd: number;
    spentUsd: number;
    remainingUsd: number;
    avgCostPerRun: number;
    /** runs the remaining credit buys */
    runsLeftCredit: number;
    /** runs/day the rate limits allow (usually far above the credit ceiling) */
    runsPerDayRate: number;
    tpd: number;
    rpm: number;
  };
}

export function providerFromModelUsed(
  modelUsed: string | null,
): "gemini" | "openai" | null {
  if (!modelUsed) return null;
  if (modelUsed.startsWith("gemini")) return "gemini";
  if (modelUsed.startsWith("openai")) return "openai";
  return null;
}

/** Strips the `provider/` prefix from `agent_runs.model_used`. */
function bareModel(modelUsed: string | null): string {
  if (!modelUsed) return "";
  const slash = modelUsed.indexOf("/");
  return slash >= 0 ? modelUsed.slice(slash + 1) : modelUsed;
}

export function geminiLimitsFor(model: string) {
  return GEMINI_LIMITS[model] ?? GEMINI_FALLBACK;
}

async function geminiRequestsToday(userId: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.provider, "gemini"),
        eq(aiUsage.cached, false),
        gte(aiUsage.createdAt, start),
      ),
    );
  return row?.n ?? 0;
}

async function openaiRemaining(userId: string): Promise<{
  remainingUsd: number;
  avgCostPerRun: number;
}> {
  const [row] = await db
    .select({
      spent: sql<string>`coalesce(sum(${aiUsage.estimatedCostUsd}),0)`,
      avg: sql<string>`coalesce(avg(nullif(${aiUsage.estimatedCostUsd},0)),0)`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.provider, "openai")));
  return {
    remainingUsd: Math.max(0, OPENAI_BUDGET_USD - Number(row?.spent ?? 0)),
    avgCostPerRun: Number(row?.avg ?? 0) || 0.0013,
  };
}

/** Does this model still have daily-request / credit budget for one more call? */
export async function hasHeadroom(
  userId: string,
  choice: ModelChoice,
): Promise<boolean> {
  if (choice.provider === "gemini") {
    const limits = geminiLimitsFor(choice.model);
    return (await geminiRequestsToday(userId)) < limits.rpd;
  }
  const { remainingUsd, avgCostPerRun } = await openaiRemaining(userId);
  return remainingUsd >= Math.max(avgCostPerRun, 0.003);
}

/** Estimates how much of the free tier / credit is left for the run's provider. */
export async function computeQuota(
  userId: string,
  modelUsed: string | null,
): Promise<QuotaSummary | null> {
  const provider = providerFromModelUsed(modelUsed);
  if (!provider) return null;
  const model = bareModel(modelUsed);

  if (provider === "gemini") {
    const limits = GEMINI_LIMITS[model] ?? GEMINI_FALLBACK;

    const startOfDayUtc = new Date();
    startOfDayUtc.setUTCHours(0, 0, 0, 0);

    const [[today], [recent]] = await Promise.all([
      db
        .select({ requests: sql<number>`count(*)::int` })
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.userId, userId),
            eq(aiUsage.provider, "gemini"),
            eq(aiUsage.cached, false),
            gte(aiUsage.createdAt, startOfDayUtc),
          ),
        ),
      db
        .select({
          avg: sql<number>`coalesce(avg(coalesce(${aiUsage.inputTokens},0) + coalesce(${aiUsage.outputTokens},0)),0)::float8`,
        })
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.userId, userId),
            eq(aiUsage.provider, "gemini"),
            eq(aiUsage.cached, false),
          ),
        ),
    ]);

    const avgTokensPerRun = Math.round(recent?.avg || 0) || 1000;
    const requestsToday = today?.requests ?? 0;

    return {
      provider,
      model,
      gemini: {
        rpd: limits.rpd,
        rpm: limits.rpm,
        tpm: limits.tpm,
        requestsToday,
        remainingToday: Math.max(0, limits.rpd - requestsToday),
        runsPerMinute: Math.max(
          1,
          Math.min(
            limits.rpm,
            Math.floor(limits.tpm / Math.max(1, avgTokensPerRun)),
          ),
        ),
        avgTokensPerRun,
      },
    };
  }

  // openai — one-time USD credit + generous rate limits
  const limits = OPENAI_LIMITS[model] ?? OPENAI_FALLBACK;
  const [row] = await db
    .select({
      spent: sql<string>`coalesce(sum(${aiUsage.estimatedCostUsd}),0)`,
      avgCost: sql<string>`coalesce(avg(nullif(${aiUsage.estimatedCostUsd},0)),0)`,
      avgTok: sql<number>`coalesce(avg(nullif(coalesce(${aiUsage.inputTokens},0) + coalesce(${aiUsage.outputTokens},0), 0)),0)::float8`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.provider, "openai")));

  const spentUsd = Number(row?.spent ?? 0);
  const avgCostPerRun = Number(row?.avgCost ?? 0) || 0.0013; // typical gpt-4.1-mini run
  const avgTok = Math.round(row?.avgTok || 0) || 2000;
  const remainingUsd = Math.max(0, OPENAI_BUDGET_USD - spentUsd);

  return {
    provider,
    model,
    openai: {
      budgetUsd: OPENAI_BUDGET_USD,
      spentUsd,
      remainingUsd,
      avgCostPerRun,
      runsLeftCredit:
        avgCostPerRun > 0 ? Math.floor(remainingUsd / avgCostPerRun) : 0,
      runsPerDayRate: Math.floor(limits.tpd / Math.max(1, avgTok)),
      tpd: limits.tpd,
      rpm: limits.rpm,
    },
  };
}
