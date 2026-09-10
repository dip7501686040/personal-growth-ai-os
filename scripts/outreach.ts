/**
 * Outreach + email-apply drafts, straight into your Gmail Drafts.
 *
 *   pnpm outreach email    <folder> [--kind apply|cold] [--to addr] [--subject "..."] [--date YYYY-MM-DD]
 *   pnpm outreach send     <draftId>
 *   pnpm outreach drafts
 *   pnpm outreach linkedin <folder> [--open] [--sent recruiter|referral --note "..."]
 *   pnpm outreach status   [--json]
 *
 * `email` builds the message from the folder's cover-letter.md (apply) or the
 * Message section of pitch-recruiter.md (cold), attaches resume.pdf, and
 * creates a DRAFT only. Review it in Gmail, then `pnpm outreach send <id>`.
 *
 * `linkedin` prints the people-search URLs and the connection notes + messages
 * from the pitch files, and opens LinkedIn in your normal browser. YOU send by
 * hand — no automation. `--sent` logs the touchpoint afterward.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getOwnerUserId } from "@/lib/owner";
import { loadProfile } from "@/lib/apply/profile";
import {
  createDraft,
  listDrafts,
  openInBrowser,
  sendDraft,
  tokenExists,
} from "@/lib/outreach/gmail";
import { writeFolderFile } from "@/modules/applications/generate";
import {
  applicationsOverview,
  countApplicationsByStatus,
  listOpenApplications,
  recordTouchpoint,
} from "@/modules/applications/service";
import { pullRemote } from "./apply-sync";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

function parseFolder(a: string, dateFlag?: string): { date: string; folder: string } {
  const s = a.replace(/^applications[/\\]/, "").replace(/\/+$/, "");
  const parts = s.split("/");
  if (parts.length === 2) return { date: parts[0], folder: parts[1] };
  return { date: dateFlag ?? new Date().toISOString().slice(0, 10), folder: s };
}

function sectionOf(md: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\b.*$`, "im");
  const m = md.match(re);
  if (!m || m.index == null) return "";
  const rest = md.slice(m.index + m[0].length);
  const end = rest.search(/^##\s+/m);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

function subjectOf(md: string): string {
  return md.match(/^subject:\s*(.+)$/im)?.[1]?.trim() ?? "";
}

function signature(): string {
  const p = loadProfile();
  return ["—", p.identity.fullName, p.links.linkedin, p.links.github]
    .filter(Boolean)
    .join("\n");
}

async function emailCmd() {
  const folderArg = process.argv[3];
  if (!folderArg || folderArg.startsWith("--")) {
    throw new Error("usage: pnpm outreach email <folder> [--kind apply|cold] [--to addr]");
  }
  if (!tokenExists()) throw new Error("Not authorized — run `pnpm gmail-auth` once.");

  const { date, folder } = parseFolder(folderArg, arg("--date"));
  await pullRemote(`${date}/${folder}`).catch(() => {});
  const dir = join("applications", date, folder);
  if (!existsSync(join(dir, "job.json"))) {
    throw new Error(`no local/R2 folder for ${date}/${folder}`);
  }
  const job = JSON.parse(readFileSync(join(dir, "job.json"), "utf8")) as {
    company: string;
    role: string;
    contactEmail?: string | null;
  };

  const kind = (arg("--kind") ?? (job.contactEmail ? "apply" : "cold")) as
    | "apply"
    | "cold";
  const to = arg("--to") ?? (kind === "apply" ? job.contactEmail ?? "" : "");
  if (!to) {
    throw new Error(
      kind === "apply"
        ? "no contactEmail in job.json — pass --to <addr>"
        : "cold email needs --to <addr> (find one from outreach-targets.md)",
    );
  }

  const pitch = read(join(dir, "pitch-recruiter.md"));
  const cover = read(join(dir, "cover-letter.md"));
  const whyFit = read(join(dir, "why-fit.md"));

  let body =
    kind === "apply"
      ? cover || whyFit
      : sectionOf(pitch, "Message") || pitch.replace(/^subject:.*$/im, "").trim() || whyFit;
  if (!body) throw new Error(`no prose to send — write ${kind === "apply" ? "cover-letter.md / why-fit.md" : "pitch-recruiter.md"} first`);
  if (!/dipankar saha/i.test(body.slice(-160))) body = `${body}\n\n${signature()}`;

  const subject =
    arg("--subject") ||
    subjectOf(pitch) ||
    (kind === "apply"
      ? `Application — ${job.role}`
      : `${job.role} at ${job.company} — quick note`);

  const attachments = existsSync(join(dir, "resume.pdf"))
    ? [{ path: join(process.cwd(), dir, "resume.pdf"), contentType: "application/pdf" }]
    : [];

  const { id } = await createDraft({ to, subject, body, attachments });

  const logLine =
    `\n## ${new Date().toISOString()} · draft · ${kind} · to ${to}\n` +
    `subject: ${subject}\n` +
    `draft id: ${id}  → review in Gmail, then \`pnpm outreach send ${id}\`\n`;
  await writeFolderFile(date, folder, "outreach-log.md", read(join(dir, "outreach-log.md")) + logLine);

  console.log(
    `draft created — ${id}\n` +
      `  to: ${to}\n  subject: ${subject}\n  attach: ${attachments.length ? "resume.pdf" : "(none)"}\n` +
      `  review: https://mail.google.com/mail/u/0/#drafts\n` +
      `  send:   pnpm outreach send ${id}`,
  );
}

async function sendCmd() {
  const id = process.argv[3];
  if (!id) throw new Error("usage: pnpm outreach send <draftId>");
  if (!tokenExists()) throw new Error("Not authorized — run `pnpm gmail-auth` once.");
  const r = await sendDraft(id);
  console.log(`sent — message ${r.id} (thread ${r.threadId})`);
}

async function linkedinCmd() {
  const folderArg = process.argv[3];
  if (!folderArg || folderArg.startsWith("--")) {
    throw new Error(
      "usage: pnpm outreach linkedin <folder> [--open] [--sent recruiter|referral]",
    );
  }
  const { date, folder } = parseFolder(folderArg, arg("--date"));
  await pullRemote(`${date}/${folder}`).catch(() => {});
  const dir = join("applications", date, folder);
  if (!existsSync(join(dir, "job.json"))) {
    throw new Error(`no local/R2 folder for ${date}/${folder}`);
  }
  const job = JSON.parse(readFileSync(join(dir, "job.json"), "utf8")) as {
    company: string;
    role: string;
    contactName?: string | null;
  };

  const sent = arg("--sent");
  if (sent) {
    if (sent !== "recruiter" && sent !== "referral") {
      throw new Error("--sent must be `recruiter` or `referral`");
    }
    const userId = await getOwnerUserId();
    const hit = (await listOpenApplications(userId)).find(
      (a) => a.company === job.company && a.role === job.role,
    );
    if (!hit) {
      console.log("no ledger row — run `pnpm apply record` first");
      return;
    }
    await recordTouchpoint(userId, {
      applicationId: hit.id,
      kind: sent === "recruiter" ? "recruiter_pitch" : "referral_pitch",
      channel: "linkedin",
      note: arg("--note") ?? undefined,
    });
    const line = `\n## ${new Date().toISOString()} · linkedin · ${sent} pitch sent${
      arg("--note") ? ` — ${arg("--note")}` : ""
    }\n`;
    await writeFolderFile(
      date,
      folder,
      "outreach-log.md",
      read(join(dir, "outreach-log.md")) + line,
    );
    console.log(`logged: ${sent} pitch on LinkedIn`);
    return;
  }

  const enc = encodeURIComponent;
  const peopleSearch = (q: string) =>
    `https://www.linkedin.com/search/results/people/?keywords=${enc(q)}`;
  const searches: [string, string][] = [
    ["recruiter", peopleSearch(`${job.company} recruiter`)],
    ["eng manager", peopleSearch(`${job.company} engineering manager`)],
    ["talent", peopleSearch(`${job.company} talent acquisition`)],
  ];
  if (job.contactName)
    searches.unshift([
      `named: ${job.contactName}`,
      peopleSearch(`${job.contactName} ${job.company}`),
    ]);

  const pitchR = read(join(dir, "pitch-recruiter.md"));
  const pitchF = read(join(dir, "pitch-referral.md"));
  const note = (md: string) =>
    sectionOf(md, "LinkedIn connection note") || "(write the LinkedIn note in the pitch file)";
  const message = (md: string) =>
    sectionOf(md, "Message") || "(write the Message section in the pitch file)";

  console.log(
    [
      `LinkedIn outreach — ${job.company} / ${job.role}`,
      ``,
      `Find a person:`,
      ...searches.map(([k, u]) => `  ${k.padEnd(16)} ${u}`),
      ``,
      `── Recruiter / hiring manager ──`,
      `Connection note (≤300):`,
      `  ${note(pitchR).replace(/\n/g, "\n  ")}`,
      ``,
      `Message once connected:`,
      `  ${message(pitchR).replace(/\n/g, "\n  ")}`,
      ``,
      `── Current employee (referral) ──`,
      `Connection note (≤300):`,
      `  ${note(pitchF).replace(/\n/g, "\n  ")}`,
      ``,
      `Message once connected:`,
      `  ${message(pitchF).replace(/\n/g, "\n  ")}`,
      ``,
      `You send these by hand. After you do:`,
      `  pnpm outreach linkedin ${folderArg} --sent recruiter|referral`,
    ].join("\n"),
  );

  if (process.argv.includes("--open")) openInBrowser(searches[0][1]);
}

async function draftsCmd() {
  if (!tokenExists()) throw new Error("Not authorized — run `pnpm gmail-auth` once.");
  const rows = await listDrafts();
  if (!rows.length) {
    console.log("(no drafts)");
    return;
  }
  for (const d of rows) {
    console.log(`${d.id}  →  ${d.to || "(no to)"}  ·  ${d.subject || "(no subject)"}`);
  }
}

const STATUS_ORDER = [
  "draft",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "rejected",
  "ghosted",
];

function fmtDay(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

async function statusCmd() {
  const userId = await getOwnerUserId();
  const [rows, counts] = await Promise.all([
    applicationsOverview(userId),
    countApplicationsByStatus(userId),
  ]);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log("no applications yet");
    return;
  }

  const summary = STATUS_ORDER.filter((s) => counts[s])
    .map((s) => `${s} ${counts[s]}`)
    .join(" · ");
  console.log(`Applications — ${rows.length} total · ${summary}\n`);

  const sorted = [...rows].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  for (const r of sorted) {
    const ch = r.channels.length
      ? r.channels
          .map((c) => `${c.channel}${c.count > 1 ? `·${c.count}` : ""}`)
          .join(" ")
      : "no touchpoints";
    console.log(
      `${r.status.padEnd(12)} ${r.company} — ${r.role}\n` +
        `             channels: ${ch}` +
        (r.kinds.length ? `   kinds: ${r.kinds.join(", ")}` : "") +
        `\n             last ${fmtDay(r.lastAt)}` +
        (r.nextDueAt
          ? ` · next due ${fmtDay(r.nextDueAt)}${r.overdue ? "  [OVERDUE]" : ""}`
          : "") +
        (r.bundleDir ? `\n             ${r.bundleDir}` : "") +
        "\n",
    );
  }
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "email") return emailCmd();
  if (cmd === "send") return sendCmd();
  if (cmd === "drafts") return draftsCmd();
  if (cmd === "linkedin") return linkedinCmd();
  if (cmd === "status") return statusCmd();
  throw new Error("commands: email | send | drafts | linkedin | status");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
