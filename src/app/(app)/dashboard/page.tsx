import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/nav";
import { requireUserId } from "@/lib/user";
import { listSkills } from "@/modules/skills/service";
import { listApprovals } from "@/modules/approvals/service";
import { SKILL_LEVELS } from "@/modules/skills/levels";
import { LevelBadge } from "@/components/skills/level-badge";

export const metadata = { title: "Dashboard" };

const PANELS = [
  "Today's priorities (Chief of Staff)",
  "Agent statuses",
  "Recent activity timeline",
  "Recent development activity (Claude Code)",
  "Current projects",
  "Content queue",
];

export default async function DashboardPage() {
  const userId = await requireUserId();
  const [skills, pendingApprovals] = await Promise.all([
    listSkills(userId),
    listApprovals(userId, { status: "pending" }),
  ]);

  const byLevel = SKILL_LEVELS.map((level) => ({
    level,
    count: skills.filter((s) => s.level === level).length,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The connected view across learning, projects, proof of skills, career,
          content and business. Fully assembled in Phase 9.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Skill graph</CardTitle>
            <CardDescription>
              {skills.length} skill{skills.length === 1 ? "" : "s"} tracked
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {skills.length === 0 ? (
              <Link href="/skills" className="text-sm underline">
                Add your first skill →
              </Link>
            ) : (
              byLevel.map(({ level, count }) => (
                <span
                  key={level}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs"
                >
                  <LevelBadge level={level} />
                  <span className="tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </span>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending approvals</CardTitle>
            <CardDescription>Waiting on your decision</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingApprovals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing pending.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {pendingApprovals.slice(0, 5).map((a) => (
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Panels coming later</CardTitle>
          <CardDescription>
            Each is populated as its owning agent ships.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {PANELS.map((p) => (
              <li
                key={p}
                className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground"
              >
                {p}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sections</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {NAV_ITEMS.filter((i) => i.href !== "/dashboard").map((i) => (
              <li key={i.href} className="text-sm">
                <Link href={i.href} className="font-medium hover:underline">
                  {i.label}
                </Link>{" "}
                <span className="text-muted-foreground">— {i.phase}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
