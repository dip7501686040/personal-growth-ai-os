import Link from "next/link";
import { requireUserId } from "@/lib/user";
import { listProjects } from "@/modules/projects/service";
import { getLatestRun } from "@/modules/agents/runs";
import type { ProjectAgentResult } from "@/modules/agents/project-agent";
import { ProjectAgentPanel } from "@/components/projects/project-agent-panel";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Projects" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  idea: "outline",
  planning: "secondary",
  building: "default",
  paused: "outline",
  completed: "secondary",
};

export default async function ProjectsPage() {
  const userId = await requireUserId();
  const [projects, run] = await Promise.all([
    listProjects(userId),
    getLatestRun(userId, "project"),
  ]);
  const result = (run?.result ?? null) as ProjectAgentResult | null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn learning into shipped features. A done feature with linked
            skills becomes IMPLEMENTED-level proof.
          </p>
        </div>
        <NewProjectDialog />
      </div>

      <ProjectAgentPanel result={result} status={run?.status} />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Your projects ({projects.length})
        </h2>
        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No projects yet. Create one, or run the Project Agent for ideas.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.slug}`}
                className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>
                    {p.status}
                  </Badge>
                </div>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {p.description}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {p.featuresDone}/{p.featuresTotal} features done ·{" "}
                  {p.skillsCount} skill{p.skillsCount === 1 ? "" : "s"} linked
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
