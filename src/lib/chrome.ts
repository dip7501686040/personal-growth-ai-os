/**
 * Find a locally-installed headless-capable browser. Shared by
 * modules/resume/render.ts (PDF) and modules/content/terminal-card.ts (PNG) —
 * one candidate list, one place to add a path.
 */
import { existsSync } from "node:fs";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter((p): p is string => !!p);

export function findChrome(): string | null {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  return null;
}
