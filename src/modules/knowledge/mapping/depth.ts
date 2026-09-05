import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { levelRank, type SkillLevel } from "@/modules/skills/levels";

/**
 * "Which skill/feature do I have the most demonstrated knowledge in" — the
 * decision-tier ranking every other module reads. Pure SQL aggregation over
 * `knowledge_links`, no LLM: link volume alone isn't enough (a skill you've
 * only read about could still accumulate weak links), so it's combined with
 * the skill's own level / the feature's own status.
 *
 *   depth = sum(accepted link score) × (level-or-status rank + 1)
 */

const FEATURE_STATUS_WEIGHT: Record<string, number> = {
  planned: 1,
  in_progress: 2,
  done: 3,
};

export interface SkillDepth {
  skillId: string;
  name: string;
  category: string;
  level: SkillLevel;
  linkCount: number;
  scoreSum: number;
  depth: number;
}

export async function getSkillDepth(userId: string): Promise<SkillDepth[]> {
  const rows = await db.execute(sql`
    select s.id as skill_id, s.name, s.category, s.level,
           count(kl.id)::int as link_count,
           coalesce(sum(kl.score), 0)::float as score_sum
    from skills s
    left join knowledge_links kl
      on kl.target_id = s.id and kl.target_type = 'skill' and kl.status = 'accepted'
    where s.user_id = ${userId}
    group by s.id, s.name, s.category, s.level
  `);

  return (
    rows as unknown as {
      skill_id: string;
      name: string;
      category: string;
      level: SkillLevel;
      link_count: number;
      score_sum: number;
    }[]
  )
    .map((r) => ({
      skillId: r.skill_id,
      name: r.name,
      category: r.category,
      level: r.level,
      linkCount: r.link_count,
      scoreSum: r.score_sum,
      depth: r.score_sum * (levelRank(r.level) + 1),
    }))
    .sort((a, b) => b.depth - a.depth);
}

export interface ProjectFeatureDepth {
  featureId: string;
  title: string;
  projectId: string;
  projectName: string;
  status: string;
  linkCount: number;
  scoreSum: number;
  depth: number;
}

export async function getProjectFeatureDepth(
  userId: string,
): Promise<ProjectFeatureDepth[]> {
  const rows = await db.execute(sql`
    select pf.id as feature_id, pf.title, pf.status,
           p.id as project_id, p.name as project_name,
           count(kl.id)::int as link_count,
           coalesce(sum(kl.score), 0)::float as score_sum
    from project_features pf
    join projects p on p.id = pf.project_id
    left join knowledge_links kl
      on kl.target_id = pf.id and kl.target_type = 'project_feature' and kl.status = 'accepted'
    where pf.user_id = ${userId}
    group by pf.id, pf.title, pf.status, p.id, p.name
  `);

  return (
    rows as unknown as {
      feature_id: string;
      title: string;
      status: string;
      project_id: string;
      project_name: string;
      link_count: number;
      score_sum: number;
    }[]
  )
    .map((r) => ({
      featureId: r.feature_id,
      title: r.title,
      projectId: r.project_id,
      projectName: r.project_name,
      status: r.status,
      linkCount: r.link_count,
      scoreSum: r.score_sum,
      depth: r.score_sum * (FEATURE_STATUS_WEIGHT[r.status] ?? 1),
    }))
    .sort((a, b) => b.depth - a.depth);
}
