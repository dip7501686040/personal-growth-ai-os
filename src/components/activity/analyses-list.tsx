import Link from "next/link";
import type { ActivityAnalysis } from "@/lib/db/schema";

export function AnalysesList({ analyses }: { analyses: ActivityAnalysis[] }) {
  if (analyses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No daily analyses yet. Once sessions are captured, run &quot;Analyze
        today&quot; — or the daily cron does it automatically.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {analyses.map((a) => {
        const cats = a.workCategories as string[];
        const skills = a.suggestedSkills as {
          skill: string;
          confidence: number;
          reason: string;
        }[];
        const proof = a.potentialProof as string[];

        return (
          <li key={a.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{a.analysisDate}</span>
              <span className="text-xs text-muted-foreground">
                {(a.activityEventIds as string[]).length} session(s)
              </span>
            </div>
            <p className="mt-1 text-sm">{a.summary}</p>

            {cats.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {cats.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {skills.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Suggested skill evidence (review on{" "}
                  <Link href="/skills" className="underline">
                    Skills
                  </Link>
                  )
                </p>
                <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                  {skills.map((s) => (
                    <li key={s.skill}>
                      <span className="font-medium">{s.skill}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        ({Math.round(s.confidence * 100)}%) — {s.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {proof.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                {proof.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
