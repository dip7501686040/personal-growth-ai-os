/**
 * One-time backfill: (re)populate `entity_skill_links` for existing **published**
 * content items. Career/business opportunities were removed from the graph in
 * skill-graph-manager Phase 6 — this script no longer touches them.
 * Safe to re-run (each source is fully recomputed — see linkEntityToSkills).
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentItems } from "@/lib/db/schema";
import { getOwnerUserId } from "@/lib/owner";
import { linkEntityToSkills } from "@/modules/knowledge/entity-skill-links";

async function main() {
  const userId = await getOwnerUserId();

  const content = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.userId, userId), eq(contentItems.status, "published")));

  for (const c of content) {
    const r = await linkEntityToSkills(
      userId,
      "content_item",
      c.id,
      [c.title, c.hook, c.angle].filter(Boolean).join(". "),
    );
    console.log(
      `content ${c.id} "${c.title.slice(0, 40)}" → ${r.inserted} new, ${r.updated} updated, ${r.removed} removed`,
    );
  }

  process.exit(0);
}

main();
