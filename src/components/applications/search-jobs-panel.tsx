"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { searchJobsAction } from "@/app/(app)/applications/actions";
import type { JobSearchResult, ScoredJob } from "@/lib/jobs/types";

function Row({ j, i }: { j: ScoredJob; i: number }) {
  const gm =
    j.graphMatch != null && j.graphMatch > j.substringSkillMatch
      ? ` · graph ${j.graphMatch.toFixed(2)}`
      : "";
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs">
      <span className="w-6 shrink-0 text-muted-foreground tabular-nums">{i}</span>
      <span className="tabular-nums">{j.score.toFixed(2)}</span>
      <span className="font-medium">{j.company}</span>
      <span className="text-muted-foreground">{j.role}</span>
      <span className="ml-auto text-muted-foreground">
        {j.remoteKind} · reply {j.replyLikelihood.toFixed(2)} · skill {j.skillMatch.toFixed(2)}
        {gm}
      </span>
    </div>
  );
}

export function SearchJobsPanel() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<JobSearchResult | null>(null);

  const run = () =>
    start(async () => {
      const res = await searchJobsAction();
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setResult(res.result);
      toast.success(
        `${res.result.groupA.length} clean, ${res.result.groupB.length} flagged.`,
      );
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Search jobs</h3>
        <span className="text-xs text-muted-foreground">
          fetch + score every configured source — deterministic, no judgment needed
        </span>
        <Button size="sm" variant="secondary" className="ml-auto" disabled={pending} onClick={run}>
          {pending ? "Searching…" : "Search jobs"}
        </Button>
      </div>

      {result && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            sources: {result.sourcesUsed.join(", ") || "(none)"}
            {result.sourcesSkipped.length > 0 &&
              ` — skipped: ${result.sourcesSkipped.map((s) => s.source).join(", ")}`}
            {" · "}
            fetched {result.fetched} → {result.afterDedupe} after dedupe
            {result.graphTerms.length > 0 &&
              ` · graph terms: ${result.graphTerms.join(", ")}`}
          </p>
          <div>
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
              Group A — clean ({result.groupA.length})
            </h4>
            <div className="divide-y rounded-md border">
              {result.groupA.slice(0, 25).map((j, i) => (
                <Row key={`${j.company}-${j.role}-${i}`} j={j} i={i} />
              ))}
            </div>
          </div>
          {result.groupB.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
                Group B — flagged, review ({result.groupB.length})
              </h4>
              <div className="divide-y rounded-md border">
                {result.groupB.slice(0, 10).map((j, i) => (
                  <Row key={`${j.company}-${j.role}-${i}`} j={j} i={result.groupA.length + i} />
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Not scaffolded yet — tell a Claude Code session which indices to prep
            (`/apply-morning`), same as running <code className="text-[11px]">pnpm jobs</code>.
          </p>
        </div>
      )}
    </div>
  );
}
