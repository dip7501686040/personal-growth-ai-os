/**
 * One-time backfill (Phase 7): populate `entity_skill_links` for every
 * existing content item / career opportunity / business opportunity created
 * before this phase shipped agent-side wiring. Safe to re-run — each source
 * is fully recomputed (see linkEntityToSkills).
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  businessOpportunities,
  careerOpportunities,
  contentItems,
} from "@/lib/db/schema";
import { getOwnerUserId } from "@/lib/owner";
import { linkEntityToSkills } from "@/modules/knowledge/entity-skill-links";

async function main() {
  const userId = await getOwnerUserId();

  const content = await db.select().from(contentItems).where(eq(contentItems.userId, userId));
  for (const c of content) {
    const r = await linkEntityToSkills(
      userId,
      "content_item",
      c.id,
      [c.title, c.hook, c.angle].filter(Boolean).join(". "),
    );
    console.log(`content ${c.id} "${c.title.slice(0, 40)}" → ${r.inserted} new, ${r.updated} updated, ${r.removed} removed`);
  }

  const career = await db.select().from(careerOpportunities).where(eq(careerOpportunities.userId, userId));
  for (const c of career) {
    const r = await linkEntityToSkills(
      userId,
      "career_opportunity",
      c.id,
      `${c.role} at ${c.company}. ${c.description}`,
    );
    console.log(`career ${c.id} "${c.role}" → ${r.inserted} new, ${r.updated} updated, ${r.removed} removed`);
  }

  const business = await db.select().from(businessOpportunities).where(eq(businessOpportunities.userId, userId));
  for (const b of business) {
    const tech = (b.techStack ?? []) as string[];
    const r = await linkEntityToSkills(
      userId,
      "business_opportunity",
      b.id,
      `${b.title}. ${b.problem} ${b.proposedSolution} ${tech.join(", ")}`,
    );
    console.log(`business ${b.id} "${b.title.slice(0, 40)}" → ${r.inserted} new, ${r.updated} updated, ${r.removed} removed`);
  }

  process.exit(0);
}

main();
