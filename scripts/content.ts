/**
 * Group A — idempotent visual-proof generation. The plumbing Claude uses when
 * asked to fill in a project's "Technical deep dive": dedup check, upload +
 * register a card (however the file was produced — hand-drawn diagram,
 * auto-rendered terminal card, or a Playwright screenshot), or a real command
 * run + rendered into a macOS-Terminal-styled PNG in one step.
 *
 *   pnpm content missing [<projectSlug>]
 *   pnpm content check    <projectSlug> <featureKey>
 *   pnpm content register <file> --project <slug> --feature <key> \
 *                          --kind diagram|screenshot|video --title "..." \
 *                          [--caption "..."] [--force]
 *   pnpm content terminal --command "<cmd>" --project <slug> --feature <key> \
 *                          --title "..." [--caption "..."] [--cwd <path>]
 *   pnpm content record-steps --project <slug> --feature <key> --title "..."
 *
 * Never regenerates: `register`/`terminal` refuse when a card already
 * exists for that (project, feature) unless --force is passed.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getOwnerUserId } from "@/lib/owner";
import { resourceTypeFor, uploadMedia } from "@/lib/media/cloudinary";
import {
  createPortfolioCard,
  findCardForFeature,
  findFeature,
  listMissingVisualProof,
  type CardKind,
} from "@/modules/content/service";
import { runAndRenderTerminalCard } from "@/modules/content/terminal-card";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(name);

async function missingCmd() {
  const userId = await getOwnerUserId();
  const projectSlug = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : undefined;
  const rows = await listMissingVisualProof(userId, projectSlug);
  if (rows.length === 0) {
    console.log(projectSlug ? `${projectSlug}: nothing missing.` : "Nothing missing — every shipped feature has a card.");
    return;
  }
  for (const r of rows) {
    console.log(`${r.projectSlug} / ${r.featureKey}  —  ${r.title}`);
  }
  console.log(`\n${rows.length} feature(s) with no visual-proof card yet.`);
}

async function checkCmd() {
  const userId = await getOwnerUserId();
  const [projectSlug, featureKey] = [process.argv[3], process.argv[4]];
  if (!projectSlug || !featureKey) {
    throw new Error("usage: pnpm content check <projectSlug> <featureKey>");
  }
  const feature = await findFeature(userId, projectSlug, featureKey);
  if (!feature) {
    console.log(`no such feature: ${projectSlug} / ${featureKey}`);
    return;
  }
  const existing = await findCardForFeature(userId, feature.id);
  if (existing) {
    console.log(`EXISTS — "${existing.title}" (${existing.assetType}, ${existing.isPublic ? "public" : "hidden"}) — reuse it, don't regenerate.`);
  } else {
    console.log(`MISSING — "${feature.title}"${feature.description ? `: ${feature.description}` : ""}`);
  }
}

async function requireFeature(projectSlug: string | undefined, featureKey: string | undefined) {
  if (!projectSlug || !featureKey) throw new Error("--project and --feature are required");
  const userId = await getOwnerUserId();
  const feature = await findFeature(userId, projectSlug, featureKey);
  if (!feature) throw new Error(`no such feature: ${projectSlug} / ${featureKey}`);
  return { userId, feature };
}

async function registerCmd() {
  const file = process.argv[3];
  if (!file || file.startsWith("--")) {
    throw new Error(
      "usage: pnpm content register <file> --project <slug> --feature <key> --kind diagram|screenshot|video --title \"...\" [--caption \"...\"] [--force]",
    );
  }
  if (!existsSync(file)) throw new Error(`no such file: ${file}`);
  const projectSlug = arg("--project");
  const featureKey = arg("--feature");
  const kind = arg("--kind") as CardKind | undefined;
  const title = arg("--title");
  if (!kind || !["diagram", "screenshot", "video"].includes(kind)) {
    throw new Error("--kind must be diagram | screenshot | video");
  }
  if (!title) throw new Error("--title is required");

  const { userId, feature } = await requireFeature(projectSlug, featureKey);
  const existing = await findCardForFeature(userId, feature.id);
  if (existing && !has("--force")) {
    console.log(
      `already have a card for ${projectSlug}/${featureKey}: "${existing.title}" — pass --force to add another, or edit it from /content instead.`,
    );
    return;
  }

  const resourceType = resourceTypeFor(kind);
  const publicId = `${projectSlug}/${featureKey}-${kind}`;
  const up = await uploadMedia(file, { resourceType, publicId, folder: "contents", overwrite: true });
  const card = await createPortfolioCard(userId, {
    title,
    caption: arg("--caption"),
    kind,
    cloudinaryPublicId: up.publicId,
    cloudinaryResourceType: up.resourceType,
    cloudinaryFormat: up.format,
    featureId: feature.id,
  });
  console.log(`registered "${card.title}" for ${projectSlug}/${featureKey} — live on the portfolio now.`);
}

async function terminalCmd() {
  const command = arg("--command");
  const projectSlug = arg("--project");
  const featureKey = arg("--feature");
  const title = arg("--title");
  if (!command || !title) throw new Error("--command and --title are required");

  const { userId, feature } = await requireFeature(projectSlug, featureKey);
  const existing = await findCardForFeature(userId, feature.id);
  if (existing && !has("--force")) {
    console.log(
      `already have a card for ${projectSlug}/${featureKey}: "${existing.title}" — pass --force to add another.`,
    );
    return;
  }

  const scratchDir = join(process.cwd(), ".scratch");
  mkdirSync(scratchDir, { recursive: true });
  const pngPath = join(scratchDir, `terminal-${projectSlug}-${featureKey}.png`);
  const { ok, output } = runAndRenderTerminalCard({ title, command, cwd: arg("--cwd") }, pngPath);
  console.log(`ran: ${command}\n--- output ---\n${output.slice(0, 2000)}\n--------------`);
  if (!ok) {
    throw new Error("no local Chrome/Chromium/Edge found to render the card — install one, or use `register` with a hand-made image instead.");
  }

  const up = await uploadMedia(pngPath, {
    resourceType: "image",
    publicId: `${projectSlug}/${featureKey}-screenshot`,
    folder: "contents",
    overwrite: true,
  });
  const card = await createPortfolioCard(userId, {
    title,
    caption: arg("--caption"),
    kind: "screenshot",
    cloudinaryPublicId: up.publicId,
    cloudinaryResourceType: up.resourceType,
    cloudinaryFormat: up.format,
    featureId: feature.id,
  });
  console.log(`registered "${card.title}" for ${projectSlug}/${featureKey} — live on the portfolio now.`);
}

async function recordStepsCmd() {
  const projectSlug = arg("--project");
  const featureKey = arg("--feature");
  const title = arg("--title");
  if (!projectSlug || !featureKey || !title) {
    throw new Error("usage: pnpm content record-steps --project <slug> --feature <key> --title \"...\"");
  }
  const savePath = `applications/_recordings/${projectSlug}-${featureKey}.mov`;
  console.log(
    [
      `This feature needs a real screen recording — not something to fake.`,
      ``,
      `1. Cmd+Shift+5 → "Record Selected Portion" → pick the relevant window/area.`,
      `2. Show: "${title}" actually working — ~10-15 seconds, no narration needed.`,
      `3. Stop recording, save the file as:`,
      `     ${savePath}`,
      `4. Tell me it's there — I'll pick it up with:`,
      `     pnpm content register ${savePath} --project ${projectSlug} --feature ${featureKey} --kind video --title "${title}"`,
    ].join("\n"),
  );
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "missing") return missingCmd();
  if (cmd === "check") return checkCmd();
  if (cmd === "register") return registerCmd();
  if (cmd === "terminal") return terminalCmd();
  if (cmd === "record-steps") return recordStepsCmd();
  throw new Error("commands: missing | check | register | terminal | record-steps");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
