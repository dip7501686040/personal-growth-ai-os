/**
 * Wipes and reseeds the demo account's data. Run once after
 * `pnpm provision-demo`, or any time by hand — this is also what the hourly
 * cron job and logout hook call under the hood (see src/modules/demo/reset.ts).
 *
 *   pnpm seed-demo
 */
import { getDemoUserId } from "@/lib/demo";
import { resetDemoData } from "@/modules/demo/reset";

async function main() {
  const userId = await getDemoUserId();
  if (!userId) {
    throw new Error(
      "No demo user configured/found — set DEMO_EMAIL and run `pnpm provision-demo` first.",
    );
  }
  await resetDemoData(userId);
  console.log(`Demo data reset for user ${userId}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
