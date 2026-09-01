import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/user";
import { db } from "@/lib/db";
import { skills } from "@/lib/db/schema";
import { getProject } from "@/modules/projects/service";
import { ProjectDetailsForm } from "@/components/projects/project-details-form";
import { FeatureManager } from "@/components/projects/feature-manager";
import { SkillLinker } from "@/components/projects/skill-linker";
import { deleteProjectAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: `${slug} · Projects` };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const userId = await requireUserId();

  const [data, skillRows] = await Promise.all([
    getProject(userId, slug),
    db
      .select({ id: skills.id, name: skills.name })
      .from(skills)
      .where(eq(skills.userId, userId))
      .orderBy(skills.name),
  ]);
  if (!data) notFound();

  const { project, features, projectSkills } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/projects"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Projects
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <Badge variant="secondary">{project.status}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectDetailsForm project={project} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project-level skills</CardTitle>
          </CardHeader>
          <CardContent>
            <SkillLinker
              projectId={project.id}
              slug={project.slug}
              skills={skillRows}
              linked={projectSkills}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Feature-level links (below) are what create skill evidence when a
              feature is marked done.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Features ({features.filter((f) => f.status === "done").length}/
            {features.length} done)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FeatureManager
            projectId={project.id}
            slug={project.slug}
            features={features}
            skills={skillRows}
          />
        </CardContent>
      </Card>

      <form action={deleteProjectAction}>
        <input type="hidden" name="projectId" value={project.id} />
        <Button type="submit" variant="ghost" size="sm" className="text-destructive">
          Delete project
        </Button>
      </form>
    </div>
  );
}
