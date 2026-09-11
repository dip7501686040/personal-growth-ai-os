/**
 * Print the standing answers for a set of form-field labels — the deterministic
 * half of the `apply-drive` skill (so Claude doesn't re-derive profile logic).
 *
 *   pnpm apply-answers "First name" "Authorized to work in the US?" "Salary expectations"
 *   pnpm apply-answers --profile        # full profile + the still-empty fields
 *
 * Output is JSON on stdout.
 */
import { answerFor, loadProfile, profileGaps } from "@/lib/apply/profile";

async function main() {
  const args = process.argv.slice(2);
  const profile = await loadProfile();

  if (args.includes("--profile") || args.length === 0) {
    console.log(JSON.stringify({ profile, gaps: profileGaps(profile) }, null, 2));
    return;
  }

  const out: Record<string, ReturnType<typeof answerFor>> = {};
  for (const label of args) out[label] = answerFor(label, profile);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
