/**
 * Local ↔ R2 sync for the applications/ tree. Shared by `pnpm apply push|pull`
 * and by `apply-prep` (which auto-pushes each folder it scaffolds).
 *
 * R2 is the source of truth; local `applications/` is a working cache.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import {
  deletePrefix,
  getObject,
  isR2Configured,
  listKeys,
  putObject,
} from "@/modules/applications/store";

export { isR2Configured };

export const LOCAL_ROOT = "applications";

/** Resolve a CLI target ("all" | "YYYY-MM-DD" | "YYYY-MM-DD/folder" | today). */
export function resolveTarget(target: string | undefined): {
  prefix: string;
  localDir: string;
  label: string;
} {
  const t = (target ?? new Date().toISOString().slice(0, 10)).replace(
    /^\/+|\/+$/g,
    "",
  );
  if (t === "all") return { prefix: "", localDir: LOCAL_ROOT, label: "all" };
  return {
    prefix: `${t}/`,
    localDir: join(LOCAL_ROOT, ...t.split("/")),
    label: t,
  };
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

/** Upload a local subtree to R2. Returns the keys written. */
export async function pushLocal(target: string | undefined): Promise<string[]> {
  const { localDir } = resolveTarget(target);
  const written: string[] = [];
  for (const abs of walkFiles(localDir)) {
    const key = relative(LOCAL_ROOT, abs).split(sep).join("/");
    await putObject(key, readFileSync(abs));
    written.push(key);
  }
  return written;
}

/** Push one folder given as `<date>/<folder>` or `applications/<date>/<folder>`. */
export async function pushFolder(relFolder: string): Promise<number> {
  const rel = relFolder
    .replace(/^applications[/\\]/, "")
    .replace(/^\/+|\/+$/g, "");
  return (await pushLocal(rel)).length;
}

/** Download an R2 subtree to local. Returns the keys pulled. */
export async function pullRemote(target: string | undefined): Promise<string[]> {
  const { prefix } = resolveTarget(target);
  const keys = await listKeys(prefix);
  for (const key of keys) {
    const body = await getObject(key);
    if (!body) continue;
    const abs = join(LOCAL_ROOT, ...key.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  return keys;
}

/** Delete an R2 subtree. Never the whole bucket. */
export async function deleteRemote(target: string): Promise<number> {
  const { prefix } = resolveTarget(target);
  if (!prefix) throw new Error("refusing to delete the whole bucket");
  return deletePrefix(prefix);
}
