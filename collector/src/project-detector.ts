import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { config } from "./config.ts";
import { repoRoot } from "./git.ts";

export interface DetectedProject {
  /** Absolute path the server matches against a project's `repo_path`. */
  projectPath: string;
  projectName: string;
}

export function detectProject(cwd: string): DetectedProject {
  const root = repoRoot(cwd) || cwd;

  // 1. explicit config map (exact or prefix)
  for (const path of Object.keys(config.projects)) {
    if (root === path || cwd === path || cwd.startsWith(`${path}/`)) {
      return { projectPath: path, projectName: basename(path) };
    }
  }

  // 2. package.json name
  let name = basename(root);
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkgName = JSON.parse(readFileSync(pkgPath, "utf8")).name;
      if (pkgName) name = String(pkgName).replace(/^@[^/]+\//, "");
    } catch {
      // ignore
    }
  }

  return { projectPath: root, projectName: name };
}
