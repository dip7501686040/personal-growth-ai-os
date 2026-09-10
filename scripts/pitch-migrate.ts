/**
 * One-off: wrap legacy single-blob pitch-*.md into the 3-part structure
 * (Subject: line / ## Message / ## LinkedIn connection note). Idempotent —
 * skips files that already have a "## Message" heading or are still an
 * untouched `<!-- ... -->` stub.
 *
 *   pnpm tsx scripts/pitch-migrate.ts [<date>]     # default: every date in R2
 */
import {
  listDates,
  listJobFolders,
  readFolderFile,
  writeFolderFile,
} from "@/modules/applications/generate";

function linkedinNote(body: string, max = 300): string {
  const clean = body.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return stop > 140 ? cut.slice(0, stop + 1) : `${cut.slice(0, max - 1).trimEnd()}…`;
}

function subjectFor(kind: "recruiter" | "referral", company: string, role: string): string {
  return kind === "recruiter"
    ? `${role} — Dipankar Saha`
    : `Referral for ${company}'s ${role.replace(/^senior\s+/i, "")}?`;
}

async function migrate(
  date: string,
  folder: string,
  file: "pitch-recruiter.md" | "pitch-referral.md",
  company: string,
  role: string,
): Promise<string> {
  const cur = await readFolderFile(date, folder, file);
  if (cur == null) return "absent";
  const trimmed = cur.trim();
  if (/^##\s+Message\b/m.test(cur)) return "already-3-part";
  if (trimmed.startsWith("<!--") || trimmed.startsWith("# Pitch —")) return "stub";

  const kind = file === "pitch-recruiter.md" ? "recruiter" : "referral";
  const who =
    kind === "recruiter" ? "recruiter / hiring manager" : "a current employee (referral)";
  const out = [
    `# Pitch — ${who} · ${company}`,
    ``,
    `Subject: ${subjectFor(kind, company, role)}`,
    ``,
    `## Message`,
    ``,
    trimmed,
    ``,
    `## LinkedIn connection note (≤300 chars)`,
    ``,
    linkedinNote(trimmed),
    ``,
  ].join("\n");
  await writeFolderFile(date, folder, file, out);
  return "migrated";
}

async function main() {
  const only = process.argv[2];
  const dates = only ? [only] : await listDates();
  const tally: Record<string, number> = {};

  for (const date of dates) {
    for (const folder of await listJobFolders(date)) {
      const jobRaw = await readFolderFile(date, folder, "job.json");
      if (!jobRaw) continue;
      const job = JSON.parse(jobRaw) as { company: string; role: string };
      for (const file of ["pitch-recruiter.md", "pitch-referral.md"] as const) {
        const r = await migrate(date, folder, file, job.company, job.role);
        tally[r] = (tally[r] ?? 0) + 1;
        if (r === "migrated") console.log(`  ${date}/${folder}/${file}`);
      }
    }
  }
  console.log("\n" + Object.entries(tally).map(([k, v]) => `${k}: ${v}`).join(" · "));
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
