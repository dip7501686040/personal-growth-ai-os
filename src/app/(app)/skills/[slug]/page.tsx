import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/user";
import { getSkillBySlug } from "@/modules/skills/service";
import { deriveLevel } from "@/modules/skills/progression";
import { CATEGORY_LABEL, LEVEL_LABEL } from "@/modules/skills/levels";
import { LevelBadge } from "@/components/skills/level-badge";
import { ChangeLevelForm } from "@/components/skills/change-level-form";
import { AddEvidenceForm } from "@/components/skills/add-evidence-form";
import { EvidenceList } from "@/components/skills/evidence-list";
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
  return { title: `${slug} · Skills` };
}

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const userId = await requireUserId();
  const data = await getSkillBySlug(userId, slug);
  if (!data) notFound();

  const { skill, evidence } = data;
  const accepted = evidence.filter((e) => e.status === "accepted");
  const derived = deriveLevel(
    accepted.map((e) => ({
      id: e.id,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      supportsLevel: e.supportsLevel,
      strength: e.strength,
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/skills"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Skills
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{skill.name}</h1>
          <LevelBadge level={skill.level} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {CATEGORY_LABEL[skill.category]} · confidence {skill.confidence}
          {skill.notes ? ` · ${skill.notes}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How this level was derived</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
          {derived.rationale.map((r, i) => (
            <p key={i}>{r}</p>
          ))}
          {derived.ambiguous && (
            <p className="text-amber-700 dark:text-amber-400">
              Evidence claims {LEVEL_LABEL[derived.claimed]} but the rules only
              justify {LEVEL_LABEL[derived.level]}.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change level</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangeLevelForm
              skillId={skill.id}
              slug={skill.slug}
              currentLevel={skill.level}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <AddEvidenceForm skillId={skill.id} slug={skill.slug} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Evidence timeline ({evidence.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EvidenceList
            slug={skill.slug}
            evidence={evidence.map((e) => ({
              id: e.id,
              sourceType: e.sourceType,
              summary: e.summary,
              detail: e.detail,
              strength: e.strength,
              supportsLevel: e.supportsLevel,
              status: e.status,
              createdBy: e.createdBy,
              createdAt: e.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
