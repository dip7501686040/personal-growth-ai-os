import Link from "next/link";
import { requireUserId } from "@/lib/user";
import { listSkills } from "@/modules/skills/service";
import {
  CATEGORY_LABEL,
  SKILL_CATEGORIES,
  SKILL_LEVELS,
  type SkillCategory,
} from "@/modules/skills/levels";
import { LevelBadge } from "@/components/skills/level-badge";
import { AddSkillDialog } from "@/components/skills/add-skill-dialog";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Skills" };

export default async function SkillsPage() {
  const userId = await requireUserId();
  const skills = await listSkills(userId);

  const byLevel = SKILL_LEVELS.map((lvl) => ({
    level: lvl,
    count: skills.filter((s) => s.level === lvl).length,
  }));

  const grouped = SKILL_CATEGORIES.map((cat) => ({
    category: cat as SkillCategory,
    items: skills.filter((s) => s.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your Proof-of-Skills graph. Level is derived from accepted evidence —
            you can&apos;t just declare it.
          </p>
        </div>
        <AddSkillDialog />
      </div>

      {skills.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No skills yet. Add one, or run the resume seed
            (<code>pnpm db:seed</code>).
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {byLevel.map(({ level, count }) => (
              <span
                key={level}
                className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs"
              >
                <LevelBadge level={level} />
                <span className="tabular-nums text-muted-foreground">
                  {count}
                </span>
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-8">
            {grouped.map(({ category, items }) => (
              <section key={category} className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {CATEGORY_LABEL[category]}
                </h2>
                <div className="divide-y rounded-lg border">
                  {items.map((s) => (
                    <Link
                      key={s.id}
                      href={`/skills/${s.slug}`}
                      className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.acceptedCount} accepted
                          {s.suggestedCount > 0
                            ? ` · ${s.suggestedCount} to review`
                            : ""}
                          {" · "}confidence {s.confidence}
                        </p>
                      </div>
                      <LevelBadge level={s.level} />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
