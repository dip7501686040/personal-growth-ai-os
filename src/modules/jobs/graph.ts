import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectFeatures, skills } from "@/lib/db/schema";
import type { GraphMatch } from "@/lib/jobs/types";
import { matchSkillsAndFeatures } from "@/modules/knowledge/mapping/entity-candidates";

/**
 * Phase 7 — the knowledge-graph half of the job search. `resume/job-search.json`
 * stays hand-maintained; this adds a second signal from the real graph:
 *   - `deriveGraphSearchTerms` → extra source-query terms
 *   - `makeGraphMatcher`       → per-JD skill/feature match, blended into score
 */

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Extra query terms for the keyed job sources: the owner's implemented/proven,
 * non-excluded skills (by confidence) plus their top knowledge taxonomy tags.
 * De-duped, capped — `runJobSearch` trims further and drops anything already in
 * the manual `titles`.
 */
export async function deriveGraphSearchTerms(userId: string): Promise<string[]> {
  const skillRows = await db
    .select({ name: skills.name, label: skills.label })
    .from(skills)
    .where(
      and(
        eq(skills.userId, userId),
        isNull(skills.excludedAt),
        inArray(skills.level, ["implemented", "proven"]),
      ),
    )
    .orderBy(desc(skills.confidence))
    .limit(12);
  const skillTerms = skillRows.map((r) => (r.label ?? r.name).trim()).filter(Boolean);

  let taxTerms: string[] = [];
  try {
    const rows = await db.execute(sql`
      select kt.label as label, count(*)::int as n
      from knowledge_document_tags t
      join knowledge_taxonomy kt on kt.slug = t.tag_slug
      where t.user_id = ${userId}
      group by kt.label
      order by n desc
      limit 4
    `);
    taxTerms = (rows as unknown as { label: string }[]).map((r) => r.label);
  } catch {
    // taxonomy tags are optional
  }

  // Concrete skill labels ("Kubernetes", "RAG") make far better source queries
  // than taxonomy labels ("Tooling"); keep the taxonomy terms as a tail.
  return [...new Set([...skillTerms, ...taxTerms])].slice(0, 8);
}

async function loadEntityNames(userId: string) {
  const [s, f] = await Promise.all([
    db
      .select({ id: skills.id, name: skills.name, label: skills.label })
      .from(skills)
      .where(eq(skills.userId, userId)),
    db
      .select({ id: projectFeatures.id, title: projectFeatures.title })
      .from(projectFeatures)
      .where(eq(projectFeatures.userId, userId)),
  ]);
  return {
    skills: new Map(s.map((r) => [r.id, r.label ?? r.name])),
    features: new Map(f.map((r) => [r.id, r.title])),
  };
}

/**
 * A per-JD matcher backed by the same `matchSkillsAndFeatures` that powers
 * `get_proof_for_jd` (excluded skills/features already filtered out, aliases
 * resolved). Names are loaded once and cached across calls.
 */
export function makeGraphMatcher(
  userId: string,
): (jdText: string) => Promise<GraphMatch | null> {
  let names: Awaited<ReturnType<typeof loadEntityNames>> | null = null;
  return async (jdText: string) => {
    if (!names) names = await loadEntityNames(userId);
    const scored = await matchSkillsAndFeatures(userId, jdText, {
      keepNameMatches: true,
    });
    const sk = scored.filter((c) => c.targetType === "skill");
    const ft = scored.filter((c) => c.targetType === "project_feature");
    if (sk.length === 0 && ft.length === 0) return null;

    // ~3 strong skill hits → a full 1.0 match.
    const score = Math.min(1, sk.reduce((n, c) => n + c.score, 0) / 3);
    return {
      score: round(score),
      skills: sk
        .map((c) => ({
          name: names!.skills.get(c.targetId) ?? c.nameMatch ?? c.targetId,
          score: round(c.score),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 12),
      features: ft
        .map((c) => ({
          title: names!.features.get(c.targetId) ?? c.nameMatch ?? c.targetId,
          score: round(c.score),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8),
    };
  };
}
