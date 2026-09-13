export type CardRole = "ui" | "terminal";

/** UI-view proof cards are tagged by a `-ui` cloudinaryPublicId suffix (see
 *  scripts/content.ts's `browser` command); everything else (a diagram, a
 *  hand-registered screenshot, the original terminal command output) counts
 *  as "terminal" — a naming convention, not a schema column, so a UI card
 *  and a terminal card can coexist per feature without a migration.
 *
 *  Single source of truth: content/service.ts, public/service.ts, and
 *  applications/visual-proof.ts each used to reimplement this check
 *  independently. */
export function cardRoleOf(cloudinaryPublicId: string | null | undefined): CardRole {
  return (cloudinaryPublicId ?? "").endsWith("-ui") ? "ui" : "terminal";
}
