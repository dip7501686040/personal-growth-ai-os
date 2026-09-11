/**
 * Local resume/ ↔ `my-files` R2 sync. Once the bucket is provisioned and
 * verified, `pnpm files push` migrates everything up in one go — this is
 * what Group R3 (dropping resume/ from git) depends on.
 *
 *   pnpm files push [file]     # resume/<file> -> R2 (default: every file in resume/)
 *   pnpm files pull [file]     # R2 -> resume/<file> (default: everything under resume/)
 *   pnpm files list [prefix]
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getFile, isR2Configured, listFiles, putFile } from "@/modules/files/store";

const LOCAL_ROOT = join(process.cwd(), "resume");

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

async function pushCmd(file?: string) {
  if (!isR2Configured()) throw new Error("R2 is not configured (.env.local).");
  const files = file ? [join(LOCAL_ROOT, file)] : walk(LOCAL_ROOT);
  let n = 0;
  for (const abs of files) {
    const key = `resume/${abs.slice(LOCAL_ROOT.length + 1)}`;
    await putFile(key, readFileSync(abs));
    console.log(`  → ${key}`);
    n++;
  }
  console.log(`pushed ${n} file(s) to my-files`);
}

async function pullCmd(file?: string) {
  if (!isR2Configured()) throw new Error("R2 is not configured (.env.local).");
  const keys = file ? [`resume/${file}`] : await listFiles("resume/");
  let n = 0;
  for (const key of keys) {
    const body = await getFile(key);
    if (!body) continue;
    const abs = join(LOCAL_ROOT, key.replace(/^resume\//, ""));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
    console.log(`  ← ${key}`);
    n++;
  }
  console.log(`pulled ${n} file(s) from my-files`);
}

async function listCmd(prefix = "resume/") {
  if (!isR2Configured()) throw new Error("R2 is not configured (.env.local).");
  const keys = await listFiles(prefix);
  if (!keys.length) {
    console.log("(empty)");
    return;
  }
  for (const k of keys) console.log(k);
}

async function main() {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  if (cmd === "push") return pushCmd(arg);
  if (cmd === "pull") return pullCmd(arg);
  if (cmd === "list") return listCmd(arg);
  throw new Error("commands: push [file] | pull [file] | list [prefix]");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
