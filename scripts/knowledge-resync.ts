/**
 * Manual catch-up for the knowledge base — drains the context-events outbox,
 * re-embeds every link-target entity, and re-maps stale documents.
 *
 *   pnpm knowledge:resync          # incremental (stale docs only)
 *   pnpm knowledge:resync --all    # re-map every non-superseded document
 *
 * This is the only non-inline path now that `knowledge-refresh` /
 * `knowledge-map` are unscheduled (skill-graph-manager Phase 1 + 6).
 */
import { getOwnerUserId } from "@/lib/owner";
import { resyncKnowledge } from "@/modules/knowledge/resync";

async function main() {
  const full = process.argv.includes("--all");
  const userId = await getOwnerUserId();
  const r = await resyncKnowledge(userId, { full });
  console.log(
    [
      `outbox: ${r.events} event(s) → ${r.docs} doc(s) / ${r.chunks} chunk(s)`,
      `remap${full ? " (all)" : ""}: scanned ${r.remap.scanned}, mapped ${r.remap.mapped}, ` +
        `skipped ${r.remap.skipped} → ${r.remap.links} link(s), ${r.remap.autoAccepted} auto-accepted`,
    ].join("\n"),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
