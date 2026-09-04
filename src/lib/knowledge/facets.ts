import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Chip counts for the documents list filter tray. Global — computed over all
 * of a user's non-superseded documents, not narrowed by the currently active
 * search/filter (a simpler, still-useful "what exists" view rather than full
 * multi-select drill-down faceting).
 */

export interface SkillFacet {
  skillId: string;
  name: string;
  category: string;
  count: number;
}

export async function getSkillFacets(userId: string): Promise<SkillFacet[]> {
  const rows = await db.execute(sql`
    select s.id as skill_id, s.name, s.category, count(distinct kl.document_id)::int as n
    from knowledge_links kl
    join skills s on s.id = kl.target_id
    join knowledge_documents kd on kd.id = kl.document_id
      and kd.user_id = ${userId} and kd.superseded_at is null
    where kl.user_id = ${userId} and kl.target_type = 'skill' and kl.status != 'rejected'
    group by s.id, s.name, s.category
    order by s.category, s.name
  `);
  return (rows as unknown as { skill_id: string; name: string; category: string; n: number }[]).map(
    (r) => ({ skillId: r.skill_id, name: r.name, category: r.category, count: r.n }),
  );
}

export interface ModuleFacet {
  targetType: string;
  count: number;
}

/** Non-skill target types only — skill has its own dedicated chip row. */
export async function getModuleFacets(userId: string): Promise<ModuleFacet[]> {
  const rows = await db.execute(sql`
    select kl.target_type, count(distinct kl.document_id)::int as n
    from knowledge_links kl
    join knowledge_documents kd on kd.id = kl.document_id
      and kd.user_id = ${userId} and kd.superseded_at is null
    where kl.user_id = ${userId} and kl.target_type != 'skill' and kl.status != 'rejected'
    group by kl.target_type
  `);
  return (rows as unknown as { target_type: string; n: number }[]).map((r) => ({
    targetType: r.target_type,
    count: r.n,
  }));
}
