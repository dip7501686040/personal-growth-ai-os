/**
 * Apply a `/sync-repo` proposal, or print a project's sync state.
 *
 *   pnpm sync-repo <proposal.json>      # reconcile the proposal into the DB
 *   pnpm sync-repo --state <slug>       # print { lastSyncedSha, featureKeys, ... } as JSON
 *
 * The `/sync-repo` Claude Code skill produces the proposal JSON; this is the
 * only thing that writes to the DB (via the projects service layer, so all
 * invariants hold). Idempotent — safe to re-run against the same repo.
 */
import { readFileSync } from "node:fs";
import { getOwnerUserId } from "@/lib/owner";
import {
  applySyncProposal,
  getSyncState,
  type SyncProposal,
} from "@/modules/projects/sync";

async function main() {
  const args = process.argv.slice(2);
  const userId = await getOwnerUserId();

  if (args[0] === "--state") {
    const slug = args[1];
    if (!slug) throw new Error("usage: pnpm sync-repo --state <slug>");
    console.log(JSON.stringify(await getSyncState(userId, slug), null, 2));
    process.exit(0);
  }

  const path = args[0];
  if (!path) {
    throw new Error("usage: pnpm sync-repo <proposal.json>  |  --state <slug>");
  }

  const proposal = JSON.parse(readFileSync(path, "utf8")) as SyncProposal;
  if (!proposal.project?.name || !Array.isArray(proposal.features)) {
    throw new Error("proposal must have { project: { name, status }, features: [] }");
  }

  const r = await applySyncProposal(userId, proposal);
  console.log(
    [
      `project ${r.project.slug}: status ${r.project.statusBefore} → ${r.project.statusAfter}`,
      `features: +${r.featuresInserted} new, ~${r.featuresUpdated} updated, ${r.featuresUnchanged} unchanged`,
      `evidence: +${r.evidenceSuggested} suggested, ${r.evidenceSkipped} already existed`,
      r.skillsCreated.length ? `skills created: ${r.skillsCreated.join(", ")}` : "no new skills",
      r.staleFeatures.length
        ? `stale (not in repo this run): ${r.staleFeatures.map((s) => s.title).join(", ")}`
        : "no stale features",
    ].join("\n"),
  );
  if (r.evidenceSuggested > 0) {
    console.log(`\n→ review the ${r.evidenceSuggested} suggested evidence at /skills, then Accept.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
