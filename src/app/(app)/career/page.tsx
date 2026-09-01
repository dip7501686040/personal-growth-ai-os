import Link from "next/link";
import { requireUserId } from "@/lib/user";
import { listOpportunities } from "@/modules/career/service";
import { NewOpportunityDialog } from "@/components/career/new-opportunity-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Career" };

const REC_CLASS: Record<string, string> = {
  yes: "text-emerald-600 dark:text-emerald-400",
  maybe: "text-amber-600 dark:text-amber-400",
  no: "text-muted-foreground",
};

export default async function CareerPage() {
  const userId = await requireUserId();
  const opps = await listOpportunities(userId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Career</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste a job. The Career Agent scores it against your real
            proof-of-skills — no inflation.
          </p>
        </div>
        <NewOpportunityDialog />
      </div>

      {opps.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No jobs yet. Add one to get an honest match analysis.
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y rounded-lg border">
          {opps.map((o) => (
            <Link
              key={o.id}
              href={`/career/${o.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {o.role} · {o.company}
                </p>
                <p className="text-xs text-muted-foreground">
                  {o.status}
                  {o.location ? ` · ${o.location}` : ""}
                </p>
              </div>
              {o.latestScore != null && (
                <div className="shrink-0 text-right">
                  <span className="text-sm font-semibold tabular-nums">
                    {o.latestScore}%
                  </span>
                  {o.latestRecommendation && (
                    <span
                      className={cn(
                        "ml-2 text-xs font-medium uppercase",
                        REC_CLASS[o.latestRecommendation],
                      )}
                    >
                      {o.latestRecommendation}
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
