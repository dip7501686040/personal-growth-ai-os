import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeLinks, knowledgeTargetTypeEnum } from "@/lib/db/schema";

type TargetType = (typeof knowledgeTargetTypeEnum.enumValues)[number];

/** Document ids whose knowledge_links include ANY of these skills (not rejected). */
export async function docIdsForSkills(
  userId: string,
  skillIds: string[],
): Promise<string[]> {
  if (skillIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ id: knowledgeLinks.documentId })
    .from(knowledgeLinks)
    .where(
      and(
        eq(knowledgeLinks.userId, userId),
        eq(knowledgeLinks.targetType, "skill"),
        inArray(knowledgeLinks.targetId, skillIds),
        ne(knowledgeLinks.status, "rejected"),
      ),
    );
  return rows.map((r) => r.id);
}

/** Document ids whose knowledge_links include ANY of these module target types. */
export async function docIdsForTargetTypes(
  userId: string,
  targetTypes: string[],
): Promise<string[]> {
  if (targetTypes.length === 0) return [];
  const rows = await db
    .selectDistinct({ id: knowledgeLinks.documentId })
    .from(knowledgeLinks)
    .where(
      and(
        eq(knowledgeLinks.userId, userId),
        inArray(knowledgeLinks.targetType, targetTypes as TargetType[]),
        ne(knowledgeLinks.status, "rejected"),
      ),
    );
  return rows.map((r) => r.id);
}

interface SearchHit {
  id: string;
}

/**
 * Document ids matching free text — OR of:
 *  - full-text search over title (weight A) + body (weight B)
 *  - trigram fuzzy match on title (typo-tolerant)
 *  - a linked entity's name/title (the "mapped item" search: skills, projects,
 *    career opportunities, content, business opportunities, learning sessions,
 *    DSA patterns)
 *  - a taxonomy tag's label
 */
export async function searchDocIds(userId: string, q: string): Promise<string[]> {
  const like = `%${q}%`;
  const rows = await db.execute(sql`
    select kd.id
    from knowledge_documents kd
    where kd.user_id = ${userId} and kd.superseded_at is null and (
      kd.search_tsv @@ websearch_to_tsquery('english', ${q})
      or similarity(kd.title, ${q}) > 0.25
      or exists (
        select 1 from knowledge_links kl
        where kl.document_id = kd.id and kl.status != 'rejected' and (
          exists (
            select 1 from skills s
            where s.id = kl.target_id and kl.target_type = 'skill' and s.name ilike ${like}
          )
          or exists (
            select 1 from projects p
            where p.id = kl.target_id and kl.target_type = 'project' and p.name ilike ${like}
          )
          or exists (
            select 1 from career_opportunities co
            where co.id = kl.target_id and kl.target_type = 'career_opportunity'
              and (co.role ilike ${like} or co.company ilike ${like})
          )
          or exists (
            select 1 from content_items ci
            where ci.id = kl.target_id and kl.target_type = 'content_item' and ci.title ilike ${like}
          )
          or exists (
            select 1 from business_opportunities bo
            where bo.id = kl.target_id and kl.target_type = 'business_opportunity' and bo.title ilike ${like}
          )
          or exists (
            select 1 from learning_sessions ls
            where ls.id = kl.target_id and kl.target_type = 'learning_session' and ls.topic ilike ${like}
          )
          or exists (
            select 1 from dsa_patterns dp
            where dp.id = kl.target_id and kl.target_type = 'dsa_pattern' and dp.name ilike ${like}
          )
        )
      )
      or exists (
        select 1 from knowledge_document_tags kdt
        join knowledge_taxonomy kt on kt.slug = kdt.tag_slug
        where kdt.document_id = kd.id and kt.label ilike ${like}
      )
    )
  `);
  return (rows as unknown as SearchHit[]).map((r) => r.id);
}

/** Intersect any number of already-resolved id restrictions (undefined = "no
 *  restriction from this filter"). Returns undefined only when every filter was
 *  unset — i.e. don't restrict at all. */
export function intersectRestrictions(
  ...sets: (string[] | undefined)[]
): string[] | undefined {
  const active = sets.filter((s): s is string[] => s !== undefined);
  if (active.length === 0) return undefined;
  return active.reduce((acc, ids) => acc.filter((id) => ids.includes(id)));
}
