import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RunAgentButton } from "@/components/run-agent-button";
import type { DailyBriefing } from "@/lib/db/schema";

const CATEGORY_CLASS: Record<string, string> = {
  review: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  learning: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  dsa: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  project: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  career: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  content: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  business: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
};

export function BriefingCard({ briefing }: { briefing: DailyBriefing | null }) {
  const priorities = (briefing?.priorities ?? []) as {
    title: string;
    why: string;
    ref: string;
    category: string;
  }[];
  const connections = (briefing?.connections ?? []) as { note: string }[];
  const snapshot = (briefing?.agentStatusSnapshot ?? []) as {
    agent: string;
    status: string;
    lastRunAt: string | null;
  }[];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Today&apos;s priorities</CardTitle>
          <RunAgentButton agent="chief_of_staff" label="Refresh briefing" />
        </div>
        <CardDescription>
          {briefing
            ? `${briefing.briefingDate} · ${briefing.summary}`
            : "Run the Chief of Staff to connect the agents into a plan."}
        </CardDescription>
      </CardHeader>

      {briefing && (
        <CardContent className="flex flex-col gap-5">
          <ol className="flex flex-col gap-3">
            {priorities.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 text-sm font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        CATEGORY_CLASS[p.category] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {p.category}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">Why: {p.why}</p>
                  {p.ref && (
                    <p className="text-xs text-muted-foreground">{p.ref}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {connections.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Connections
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {connections.map((c, i) => (
                  <li key={i}>{c.note}</li>
                ))}
              </ul>
            </div>
          )}

          {snapshot.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {snapshot.map((s) => (
                <span
                  key={s.agent}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs"
                >
                  <span className="font-medium">{s.agent.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">{s.status}</span>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
