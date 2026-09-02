"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AgentRunConsole } from "@/components/agent-run-console";
import { createFromIdeaAction } from "@/app/(app)/projects/actions";
import type { ProjectAgentResult } from "@/modules/agents/project-agent";
import type { AgentConsoleData } from "@/modules/agents/runs";

export function ProjectAgentPanel({
  result,
  status,
  userId,
  agentConsole,
}: {
  result: ProjectAgentResult | null;
  status?: string;
  userId: string;
  agentConsole?: AgentConsoleData;
}) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Project Agent</CardTitle>
          {result && (
            <Badge variant="secondary">
              {result.source === "ai" ? result.model ?? "ai" : "no-AI fallback"}
            </Badge>
          )}
        </div>
        <CardDescription>
          {result
            ? `${result.generatedAt}${
                status && status !== "completed" ? ` · ${status}` : ""
              }${result.note ? ` · ${result.note}` : ""}`
            : "Run to get portfolio gaps and project ideas tied to your skills."}
        </CardDescription>
        <AgentRunConsole
          agent="project"
          userId={userId}
          label="Run Project Agent"
          initial={agentConsole}
        />
      </CardHeader>

      {result && (
        <CardContent className="flex flex-col gap-5">
          {result.plan.portfolioGaps.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-muted-foreground">
                Portfolio gaps
              </p>
              <ul className="flex flex-col gap-2">
                {result.plan.portfolioGaps.map((g, i) => (
                  <li key={i} className="rounded-md border bg-card p-2 text-sm">
                    <span className="font-medium">{g.gap}</span>
                    <p className="text-muted-foreground">{g.why}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-muted-foreground">
              Project ideas
            </p>
            {result.plan.projectIdeas.map((idea, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{idea.name}</p>
                    <p className="text-sm text-muted-foreground">{idea.pitch}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {idea.buildComplexity}
                  </Badge>
                </div>

                <p className="mt-2 text-sm">
                  <span className="text-muted-foreground">Solves: </span>
                  {idea.problemSolved}
                </p>

                <div className="mt-2 flex flex-wrap gap-1">
                  {idea.targetSkills.map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                  {idea.suggestedFeatures.map((f, j) => (
                    <li key={j}>
                      {f.title}
                      {f.skills.length > 0 && (
                        <span className="text-xs"> — {f.skills.join(", ")}</span>
                      )}
                    </li>
                  ))}
                </ul>

                <form action={createFromIdeaAction} className="mt-3">
                  <input
                    type="hidden"
                    name="idea"
                    value={JSON.stringify({
                      name: idea.name,
                      pitch: idea.pitch,
                      problemSolved: idea.problemSolved,
                      targetSkills: idea.targetSkills,
                      suggestedFeatures: idea.suggestedFeatures,
                    })}
                  />
                  <Button type="submit" size="sm" variant="outline">
                    Create this project
                  </Button>
                </form>
              </div>
            ))}
          </div>

          {result.plan.existingProjectNextSteps.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-muted-foreground">
                Next steps for existing projects
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {result.plan.existingProjectNextSteps.map((n, i) => (
                  <li key={i}>
                    <span className="font-medium">{n.project}:</span>{" "}
                    <span className="text-muted-foreground">{n.suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
