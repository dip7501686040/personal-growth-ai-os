import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { listSkills } from "@/modules/skills/service";
import { listApprovals } from "@/modules/approvals/service";
import { listProjects } from "@/modules/projects/service";
import { listContentItems } from "@/modules/content/service";
import { getLatestBriefing } from "@/modules/briefing/service";
import { getAgentConsole, getAgentStatusBoard } from "@/modules/agents/runs";
import { listRecentEvents } from "@/modules/activity/service";
import { SKILL_LEVELS } from "@/modules/skills/levels";
import { LevelBadge } from "@/components/skills/level-badge";
import { BriefingCard } from "@/components/briefing/briefing-card";
import { AgentStatusBoard } from "@/components/activity/agent-status-board";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const userId = user.id;
  const [
    skills,
    pendingApprovals,
    projects,
    content,
    briefing,
    statusBoard,
    recentSessions,
    briefingConsole,
  ] = await Promise.all([
    listSkills(userId),
    listApprovals(userId, { status: "pending" }),
    listProjects(userId),
    listContentItems(userId),
    getLatestBriefing(userId),
    getAgentStatusBoard(userId),
    listRecentEvents(userId, 3),
    getAgentConsole(userId, "chief_of_staff"),
  ]);

  const byLevel = SKILL_LEVELS.map((level) => ({
    level,
    count: skills.filter((s) => s.level === level).length,
  }));
  const contentByStatus = content.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One connected view. The Chief of Staff turns every agent&apos;s output
          into today&apos;s plan.
        </p>
      </div>

      <BriefingCard
        briefing={briefing}
        userId={userId}
        agentConsole={briefingConsole}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agents</CardTitle>
          <CardDescription>
            Live · full timeline on{" "}
            <Link href="/activity" className="underline">
              Agent Activity
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentStatusBoard userId={userId} initial={statusBoard} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending approvals</CardTitle>
            <CardDescription>Agents blocked on your decision</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingApprovals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing pending.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {pendingApprovals.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <Link href="/approvals" className="hover:underline">
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Skill graph</CardTitle>
            <CardDescription>{skills.length} tracked</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {byLevel.map(({ level, count }) => (
              <span
                key={level}
                className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs"
              >
                <LevelBadge level={level} />
                <span className="tabular-nums text-muted-foreground">{count}</span>
              </span>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projects</CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {projects.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <Link
                      href={`/projects/${p.slug}`}
                      className="truncate hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.status} · {p.featuresDone}/{p.featuresTotal}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content queue</CardTitle>
          </CardHeader>
          <CardContent>
            {content.length === 0 ? (
              <p className="text-sm text-muted-foreground">Empty.</p>
            ) : (
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(contentByStatus).map(([s, n]) => (
                  <span
                    key={s}
                    className="rounded-md border bg-card px-2 py-1 text-muted-foreground"
                  >
                    {s.replace(/_/g, " ")}: {n}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent development activity</CardTitle>
            <CardDescription>From Claude Code on your Mac</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing captured yet —{" "}
                <Link href="/activity" className="underline">
                  set up the collector
                </Link>
                .
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {recentSessions.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <span className="truncate">{e.projectName ?? "unknown"}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(e.startedAt).toLocaleDateString()} ·{" "}
                      {Math.round(e.durationSeconds / 60)}m
                    </span>
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
