import { and, eq, inArray } from "drizzle-orm";
import { requireUserId } from "@/lib/user";
import { db } from "@/lib/db";
import { skills } from "@/lib/db/schema";
import { listLearningSessions } from "@/modules/learning/service";
import { getAgentConsole, getLatestRun } from "@/modules/agents/runs";
import type { LearningAgentResult } from "@/modules/agents/learning-agent";
import { LearningPlanCard } from "@/components/learning/learning-plan-card";
import { LogSessionForm } from "@/components/learning/log-session-form";
import { AgentRunConsole } from "@/components/agent-run-console";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Learning" };

export default async function LearningPage() {
  const userId = await requireUserId();

  const [run, agentConsole, sessions, skillRows] = await Promise.all([
    getLatestRun(userId, "learning"),
    getAgentConsole(userId, "learning"),
    listLearningSessions(userId, 12),
    db
      .select({ id: skills.id, name: skills.name })
      .from(skills)
      .where(
        and(
          eq(skills.userId, userId),
          inArray(skills.level, ["interested", "learning", "practiced"]),
        ),
      )
      .orderBy(skills.name),
  ]);

  const result = (run?.result ?? null) as LearningAgentResult | null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Daily plan
        </h2>
        <AgentRunConsole
          agent="learning"
          userId={userId}
          label="Run Learning Agent"
          initial={agentConsole}
        />
      </div>

      <LearningPlanCard
        result={result}
        status={run?.status}
        ranAt={run?.finishedAt?.toISOString() ?? run?.createdAt?.toISOString()}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Log a learning session</CardTitle>
          </CardHeader>
          <CardContent>
            <LogSessionForm skillOptions={skillRows} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Recent sessions ({sessions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {sessions.map((s) => (
                  <li key={s.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{s.topic}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.occurredAt.toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.category.replace("_", " ")}
                      {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
                      {s.confidenceBefore != null && s.confidenceAfter != null
                        ? ` · confidence ${s.confidenceBefore}→${s.confidenceAfter}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
