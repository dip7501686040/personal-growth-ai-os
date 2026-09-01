/** Pure DSA pattern-recognition analytics. No DB, no LLM — fully testable. */

export type DsaFailureReason =
  | "none"
  | "could_not_identify_pattern"
  | "knew_pattern_impl_bug"
  | "tle"
  | "other";

export interface AttemptForStats {
  patternSlugs: string[];
  solved: boolean;
  hintsUsed: number;
  timeTakenMinutes: number | null;
  failureReason: DsaFailureReason;
  attemptedAt: string;
}

export interface PatternStat {
  slug: string;
  name: string;
  attempts: number;
  solved: number;
  solveRate: number;
  avgHints: number;
  avgTimeMinutes: number | null;
  couldNotIdentify: number;
  implBugs: number;
  lastAttemptedAt: string | null;
  /** Can implement it, but struggles to recognise when to reach for it. */
  recognitionGap: boolean;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function computePatternStats(
  patterns: { slug: string; name: string }[],
  attempts: AttemptForStats[],
): PatternStat[] {
  return patterns
    .map(({ slug, name }) => {
      const rows = attempts.filter((a) => a.patternSlugs.includes(slug));
      const attemptsN = rows.length;
      const solved = rows.filter((a) => a.solved).length;
      const hints = rows.reduce((s, a) => s + a.hintsUsed, 0);
      const timed = rows.filter((a) => a.timeTakenMinutes != null);
      const couldNotIdentify = rows.filter(
        (a) => a.failureReason === "could_not_identify_pattern",
      ).length;
      const implBugs = rows.filter(
        (a) => a.failureReason === "knew_pattern_impl_bug",
      ).length;
      const last = rows
        .map((a) => a.attemptedAt)
        .sort()
        .at(-1);

      const solveRate = attemptsN ? solved / attemptsN : 0;
      const recognitionGap =
        attemptsN >= 3 &&
        solveRate >= 0.5 &&
        couldNotIdentify / attemptsN >= 0.34;

      return {
        slug,
        name,
        attempts: attemptsN,
        solved,
        solveRate: round(solveRate),
        avgHints: attemptsN ? round(hints / attemptsN) : 0,
        avgTimeMinutes: timed.length
          ? round(
              timed.reduce((s, a) => s + (a.timeTakenMinutes ?? 0), 0) /
                timed.length,
              0,
            )
          : null,
        couldNotIdentify,
        implBugs,
        lastAttemptedAt: last ?? null,
        recognitionGap,
      };
    })
    .filter((s) => s.attempts > 0)
    .sort((a, b) => b.attempts - a.attempts);
}

/** Patterns most in need of practice, worst first. */
export function rankWeakPatterns(stats: PatternStat[]): PatternStat[] {
  const score = (s: PatternStat) =>
    (s.recognitionGap ? 100 : 0) +
    (1 - s.solveRate) * 40 +
    s.avgHints * 10 +
    s.couldNotIdentify * 8;
  return [...stats].sort((a, b) => score(b) - score(a));
}
