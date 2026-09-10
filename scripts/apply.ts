/**
 * Application-ledger CLI — the write side of /apply-log and /apply-followups,
 * callable without the MCP server. Thin wrapper over
 * src/modules/applications/service.ts.
 *
 *   pnpm apply record   --file <bundleDir>/job.json
 *   pnpm apply submit   <id|bundleDir> [--channel portal]
 *   pnpm apply touchpoint <id> --kind follow_up_1 [--channel email] [--note "..."]
 *   pnpm apply status   <id> <draft|applied|screening|interviewing|offer|rejected|ghosted>
 *   pnpm apply due                     # follow-ups owed (JSON)
 *   pnpm apply open                    # open applications (JSON)
 *   pnpm apply push  [all|<date>|<date/folder>]   # local applications/ → R2 (default: today)
 *   pnpm apply pull  [all|<date>|<date/folder>]   # R2 → local applications/ (default: today)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getOwnerUserId } from "@/lib/owner";
import {
  isR2Configured,
  pullRemote,
  pushLocal,
  resolveTarget,
} from "./apply-sync";
import {
  listDueFollowups,
  listOpenApplications,
  recordApplication,
  recordTouchpoint,
  setApplicationStatus,
} from "@/modules/applications/service";

const argv = process.argv.slice(2);
const flag = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function resolveId(userId: string, ref: string): Promise<string> {
  if (/^[0-9a-f-]{36}$/i.test(ref)) return ref;
  // treat as a bundle dir → read job.json
  const jp = ref.endsWith(".json") ? ref : join(ref, "job.json");
  const j = JSON.parse(readFileSync(jp, "utf8")) as { id?: string; company?: string; role?: string };
  if (j.id) return j.id;
  const open = await listOpenApplications(userId);
  const hit = open.find((a) => a.company === j.company && a.role === j.role);
  if (!hit) throw new Error(`no application found for ${j.company} / ${j.role} — run 'apply record' first`);
  return hit.id;
}

async function main() {
  const cmd = argv[0];

  if (cmd === "push" || cmd === "pull") {
    if (!isR2Configured()) {
      throw new Error(
        "R2 is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and " +
          "R2_SECRET_ACCESS_KEY in .env.local.",
      );
    }
    const { label } = resolveTarget(argv[1]);
    const keys =
      cmd === "push" ? await pushLocal(argv[1]) : await pullRemote(argv[1]);
    const dir = cmd === "push" ? "→ R2" : "← R2";
    console.log(`${cmd} ${label}: ${keys.length} file(s) ${dir}`);
    return;
  }

  const userId = await getOwnerUserId();

  if (cmd === "record") {
    const file = flag("--file");
    if (!file) throw new Error("record needs --file <job.json>");
    const j = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const row = await recordApplication(userId, {
      company: String(j.company),
      role: String(j.role),
      jdText: (j.jdText as string) ?? undefined,
      jdUrl: (j.url as string) ?? undefined,
      source: (j.source as string) ?? undefined,
      contactName: (j.contactName as string) ?? undefined,
      contactChannel: j.contactEmail ? "email" : undefined,
      remoteKind: (j.remoteKind as "remote" | "onsite_foreign" | "onsite_india") ?? undefined,
      salaryLpa: typeof j.salaryLpa === "number" ? j.salaryLpa : undefined,
      companyType: (j.companyType as
        | "product"
        | "agency_named_client"
        | "agency_unnamed"
        | "body_shop"
        | "unknown") ?? undefined,
      fundingNote: ((j.funding as { note?: string })?.note) ?? undefined,
      replyLikelihood: typeof j.replyLikelihood === "number" ? j.replyLikelihood : undefined,
      skillMatch: typeof j.skillMatch === "number" ? j.skillMatch : undefined,
      flags: Array.isArray(j.flags) ? (j.flags as string[]) : undefined,
      bundleDir: (j.bundleDir as string) ?? undefined,
    });
    console.log(JSON.stringify({ id: row.id, status: row.status }, null, 2));
    return;
  }

  if (cmd === "submit") {
    const id = await resolveId(userId, argv[1]);
    const row = await recordTouchpoint(userId, {
      applicationId: id,
      kind: "submitted",
      channel: (flag("--channel") as "portal") ?? "portal",
    });
    console.log(`submitted — ${id} → applied · follow-up due ${row.nextDueAt?.toISOString() ?? "—"}`);
    return;
  }

  if (cmd === "touchpoint") {
    const id = await resolveId(userId, argv[1]);
    const kind = flag("--kind");
    if (!kind) throw new Error("touchpoint needs --kind");
    const row = await recordTouchpoint(userId, {
      applicationId: id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      kind: kind as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel: (flag("--channel") as any) ?? "other",
      note: flag("--note") ?? undefined,
    });
    console.log(`${kind} logged — next due ${row.nextDueAt?.toISOString() ?? "—"}`);
    return;
  }

  if (cmd === "status") {
    const id = await resolveId(userId, argv[1]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await setApplicationStatus(userId, id, argv[2] as any);
    console.log(`ok — ${id} → ${argv[2]}`);
    return;
  }

  if (cmd === "due") {
    console.log(JSON.stringify(await listDueFollowups(userId), null, 2));
    return;
  }
  if (cmd === "open") {
    const rows = await listOpenApplications(userId);
    console.log(
      JSON.stringify(
        rows.map((r) => ({
          id: r.id,
          company: r.company,
          role: r.role,
          status: r.status,
          bundleDir: r.bundleDir,
          lastTouchpoint: r.lastTouchpoint,
        })),
        null,
        2,
      ),
    );
    return;
  }

  throw new Error(
    "commands: record | submit | touchpoint | status | due | open | push | pull",
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
