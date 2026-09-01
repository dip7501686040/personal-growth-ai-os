import { requireUserId } from "@/lib/user";
import {
  countPendingEvents,
  listAnalyses,
  listIngestTokens,
  listRecentEvents,
} from "@/modules/activity/service";
import { getLatestRun } from "@/modules/agents/runs";
import { TokenManager } from "@/components/activity/token-manager";
import { SessionsList } from "@/components/activity/sessions-list";
import { AnalysesList } from "@/components/activity/analyses-list";
import { RunAgentButton } from "@/components/run-agent-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Agent Activity" };

export default async function ActivityPage() {
  const userId = await requireUserId();
  const [events, analyses, tokens, pending, lastRun] = await Promise.all([
    listRecentEvents(userId, 30),
    listAnalyses(userId, 14),
    listIngestTokens(userId),
    countPendingEvents(userId),
    getLatestRun(userId, "activity_analyzer"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real development activity captured from Claude Code on your Mac, and the
          daily analysis that turns it into suggested evidence.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Daily analysis</CardTitle>
            <RunAgentButton agent="activity_analyzer" label="Analyze today" />
          </div>
          <CardDescription>
            {pending} unanalysed session{pending === 1 ? "" : "s"}.
            {lastRun?.finishedAt
              ? ` Last run ${new Date(lastRun.finishedAt).toLocaleString()}.`
              : ""}{" "}
            Suggested skill evidence is never auto-accepted — review it on the
            Skills page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnalysesList analyses={analyses} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recent coding sessions ({events.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SessionsList events={events} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Collector setup</CardTitle>
          <CardDescription>
            Generate a token, put it in <code>collector/.env</code>, then run{" "}
            <code>node collector/install.ts</code>. Full guide:{" "}
            <code>collector/README.md</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TokenManager
            tokens={tokens.map((t) => ({
              id: t.id,
              label: t.label,
              createdAt: t.createdAt.toISOString(),
              lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
              revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
