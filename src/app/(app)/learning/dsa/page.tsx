import { requireUserId } from "@/lib/user";
import {
  getPatternStats,
  listDsaProblems,
  listPatterns,
  listRecentAttempts,
} from "@/modules/learning/service";
import { rankWeakPatterns } from "@/modules/learning/pattern-stats";
import { getLatestRun } from "@/modules/agents/runs";
import type { LearningAgentResult } from "@/modules/agents/learning-agent";
import { PatternStatsTable } from "@/components/learning/pattern-stats-table";
import { AddProblemForm } from "@/components/learning/add-problem-form";
import { LogAttemptForm } from "@/components/learning/log-attempt-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "DSA patterns" };

const REASON_LABEL: Record<string, string> = {
  none: "—",
  could_not_identify_pattern: "couldn't identify pattern",
  knew_pattern_impl_bug: "impl bug",
  tle: "TLE",
  other: "other",
};

export default async function DsaPage() {
  const userId = await requireUserId();

  const [patterns, problems, stats, attempts, run] = await Promise.all([
    listPatterns(),
    listDsaProblems(userId),
    getPatternStats(userId),
    listRecentAttempts(userId, 15),
    getLatestRun(userId, "learning"),
  ]);

  const weakness = (run?.result as LearningAgentResult | null)?.plan.dsaWeakness;
  const topWeak = rankWeakPatterns(stats).slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      {weakness && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-semibold">
            Learning Agent — weak pattern: {weakness.weakPattern}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {weakness.observation}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {weakness.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pattern recognition</CardTitle>
          <CardDescription>
            Deterministic view of every pattern you&apos;ve attempted.
            {topWeak.length > 0
              ? ` Weakest right now: ${topWeak.map((p) => p.name).join(", ")}.`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatternStatsTable stats={stats} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a problem</CardTitle>
          </CardHeader>
          <CardContent>
            <AddProblemForm
              patternOptions={patterns.map((p) => ({ id: p.id, name: p.name }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Log an attempt</CardTitle>
          </CardHeader>
          <CardContent>
            <LogAttemptForm
              problemOptions={problems.map((p) => ({ id: p.id, title: p.title }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recent attempts ({attempts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attempts yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {attempts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{a.title}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {a.difficulty}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {a.solved ? "solved" : "unsolved"}
                    {a.hintsUsed ? ` · ${a.hintsUsed}h` : ""}
                    {a.failureReason !== "none"
                      ? ` · ${REASON_LABEL[a.failureReason]}`
                      : ""}
                    {" · "}
                    {a.attemptedAt.toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
