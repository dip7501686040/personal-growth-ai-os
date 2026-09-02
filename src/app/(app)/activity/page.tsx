import { requireUser } from "@/lib/auth";
import {
  countPendingEvents,
  listAnalyses,
  listIngestTokens,
  listRecentEvents,
} from "@/modules/activity/service";
import {
  getAgentConsole,
  getAgentStatusBoard,
  getLatestRun,
  getRecentTimeline,
} from "@/modules/agents/runs";
import { TokenManager } from "@/components/activity/token-manager";
import { SessionsList } from "@/components/activity/sessions-list";
import { AnalysesList } from "@/components/activity/analyses-list";
import { AgentStatusBoard } from "@/components/activity/agent-status-board";
import { AgentTimeline } from "@/components/activity/agent-timeline";
import { AgentRunConsole } from "@/components/agent-run-console";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Agent Activity" };

export default async function ActivityPage() {
  const user = await requireUser();
  const userId = user.id;
  const [
    statusBoard,
    timeline,
    events,
    analyses,
    tokens,
    pending,
    lastRun,
    analyzerConsole,
  ] = await Promise.all([
    getAgentStatusBoard(userId),
    getRecentTimeline(userId, 40),
    listRecentEvents(userId, 30),
    listAnalyses(userId, 14),
    listIngestTokens(userId),
    countPendingEvents(userId),
    getLatestRun(userId, "activity_analyzer"),
    getAgentConsole(userId, "activity_analyzer"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live agent status, a run timeline, and the real development activity
          captured from Claude Code on your Mac.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent status</CardTitle>
          <CardDescription>Updates live via Supabase Realtime.</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentStatusBoard userId={userId} initial={statusBoard} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentTimeline
            userId={userId}
            initialEntries={timeline.entries}
            initialRunAgentMap={timeline.runAgentMap}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Daily development-activity analysis
          </CardTitle>
          <CardDescription>
            {pending} unanalysed session{pending === 1 ? "" : "s"}.
            {lastRun?.finishedAt
              ? ` Last run ${new Date(lastRun.finishedAt).toLocaleString()}.`
              : ""}{" "}
            Suggested skill evidence is never auto-accepted — review it on the
            Skills page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AgentRunConsole
            agent="activity_analyzer"
            userId={userId}
            label="Analyze today"
            initial={analyzerConsole}
          />
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
