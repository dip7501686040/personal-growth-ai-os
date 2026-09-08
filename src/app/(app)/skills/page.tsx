import { requireUserId } from "@/lib/user";
import { countSuggestedEvidence, listSkills } from "@/modules/skills/service";
import type { SkillWithCounts } from "@/modules/skills/service";
import { SKILL_CATEGORIES, SKILL_LEVELS } from "@/modules/skills/levels";
import { AcceptAllEvidence } from "@/components/skills/accept-all-evidence";
import { LevelBadge } from "@/components/skills/level-badge";
import { AddSkillDialog } from "@/components/skills/add-skill-dialog";
import { SkillManager } from "@/components/skills/skill-manager";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Skills" };

export default async function SkillsPage() {
  const userId = await requireUserId();
  const [skills, suggestedCount] = await Promise.all([
    listSkills(userId, { includeExcluded: true }),
    countSuggestedEvidence(userId),
  ]);

  const byLevel = SKILL_LEVELS.map((lvl) => ({
    level: lvl,
    count: skills.filter((s) => s.level === lvl && !s.parentId).length,
  }));

  // Build the one-level tree: roots grouped by category, children nested under
  // their parent regardless of the child's own category.
  const childrenOf = new Map<string, SkillWithCounts[]>();
  for (const s of skills) {
    if (s.parentId) {
      const arr = childrenOf.get(s.parentId) ?? [];
      arr.push(s);
      childrenOf.set(s.parentId, arr);
    }
  }
  const roots = skills.filter((s) => !s.parentId);
  const groups = SKILL_CATEGORIES.map((category) => ({
    category,
    roots: roots
      .filter((r) => r.category === category)
      .map((r) => ({ ...r, children: childrenOf.get(r.id) ?? [] })),
  })).filter((g) => g.roots.length > 0);

  const rootChoices = roots.map((r) => ({ id: r.id, label: r.label ?? r.name }));

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

      {suggestedCount > 0 && <AcceptAllEvidence count={suggestedCount} />}

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
                <span className="tabular-nums text-muted-foreground">{count}</span>
              </span>
            ))}
          </div>

          <SkillManager groups={groups} rootChoices={rootChoices} />
        </>
      )}
    </div>
  );
}
