import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LearningAgentResult } from "@/modules/agents/learning-agent";

function PlanRow({ label, topic, why }: { label: string; topic: string; why: string }) {
  return (
    <div className="border-l-2 border-muted pl-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm font-medium">{topic}</p>
      <p className="text-sm text-muted-foreground">Why: {why}</p>
    </div>
  );
}

export function LearningPlanCard({
  result,
  status,
  ranAt,
}: {
  result: LearningAgentResult | null;
  status?: string;
  ranAt?: string;
}) {
  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today&apos;s learning plan</CardTitle>
          <CardDescription>
            Run the Learning Agent to generate a plan.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { plan } = result;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Today&apos;s learning plan</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {result.source === "ai" ? result.model ?? "ai" : "no-AI fallback"}
            </Badge>
            {result.cached && <Badge variant="outline">cached</Badge>}
          </div>
        </div>
        <CardDescription>
          {result.generatedAt}
          {ranAt ? ` · run ${new Date(ranAt).toLocaleString()}` : ""}
          {status && status !== "completed" ? ` · ${status}` : ""}
          {result.note ? ` · ${result.note}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {plan.dsaWeakness && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="text-sm font-semibold">
              Weak pattern: {plan.dsaWeakness.weakPattern}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {plan.dsaWeakness.observation}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {plan.dsaWeakness.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <PlanRow label="DSA" topic={plan.dailyPlan.dsa.topic} why={plan.dailyPlan.dsa.why} />
          <PlanRow
            label="System design"
            topic={plan.dailyPlan.systemDesign.topic}
            why={plan.dailyPlan.systemDesign.why}
          />
          <PlanRow
            label="Technology"
            topic={plan.dailyPlan.technology.topic}
            why={plan.dailyPlan.technology.why}
          />
          {plan.dailyPlan.revision && (
            <PlanRow
              label="Revision"
              topic={plan.dailyPlan.revision.topic}
              why={plan.dailyPlan.revision.why}
            />
          )}
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <span className="font-medium">Next logical step: </span>
          {plan.nextLogicalStep}
        </div>
      </CardContent>
    </Card>
  );
}
