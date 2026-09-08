import { requireUser } from "@/lib/auth";
import {
  getAgentStatusBoard,
  getRecentTimeline,
} from "@/modules/agents/runs";
import { AgentStatusBoard } from "@/components/activity/agent-status-board";
import { AgentTimeline } from "@/components/activity/agent-timeline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Agent Activity" };

/**
 * Live agent status + run timeline (Phase 9). The Claude Code development-
 * activity capture that used to live here (coding-session list, daily analysis,
 * collector token setup) was retired in skill-graph-manager Phase 1 — see
 * `.claude/plans/skill-graph-manager.md`.
 */
export default async function ActivityPage() {
  const user = await requireUser();
  const userId = user.id;
  const [statusBoard, timeline] = await Promise.all([
    getAgentStatusBoard(userId),
    getRecentTimeline(userId, 40),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live status of every agent and a timeline of recent runs.
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
          <CardTitle className="text-base">Run timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentTimeline
            userId={userId}
            initialEntries={timeline.entries}
            initialRunAgentMap={timeline.runAgentMap}
          />
        </CardContent>
      </Card>
    </div>
  );
}
