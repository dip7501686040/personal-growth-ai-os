/**
 * "Terminal card" — a macOS-Terminal-styled screenshot of a real command's
 * real output, for the CLI-driven features that don't have a live UI page.
 * Rendered via headless Chrome (same approach as the résumé PDF), so no
 * browser automation / video capture is needed for this kind of card.
 *
 * Server / script only.
 */
import { execSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { findChrome } from "@/lib/chrome";

const MAX_LINES = 22;
const MAX_LINE_LEN = 100;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function clip(output: string): { text: string; truncated: boolean } {
  const lines = output.replace(/\r/g, "").split("\n");
  const clipped = lines
    .slice(0, MAX_LINES)
    .map((l) => (l.length > MAX_LINE_LEN ? `${l.slice(0, MAX_LINE_LEN - 1)}…` : l));
  return { text: clipped.join("\n"), truncated: lines.length > MAX_LINES };
}

export interface TerminalCardInput {
  /** window title bar text, e.g. "pnpm media list" */
  title: string;
  /** the prompt line shown, e.g. "pnpm media upload …" (no leading "$") */
  command: string;
  /** captured stdout/stderr */
  output: string;
}

function terminalHtml({ title, command, output }: TerminalCardInput): string {
  const { text, truncated } = clip(output);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 980px; padding: 40px; background: #0b0b0c; }
  .window {
    border-radius: 12px; overflow: hidden; background: #1e1e1e;
    box-shadow: 0 30px 60px rgba(0,0,0,.5); border: 1px solid #303030;
  }
  .titlebar {
    background: #2b2b2b; padding: 10px 14px; display: flex; align-items: center;
    position: relative; border-bottom: 1px solid #303030;
  }
  .dots { display: flex; gap: 8px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .dot.r { background: #ff5f56; } .dot.y { background: #ffbd2e; } .dot.g { background: #27c93f; }
  .title {
    position: absolute; left: 0; right: 0; text-align: center;
    font: 12px -apple-system, "SF Pro Text", sans-serif; color: #9a9a9a;
  }
  .body {
    padding: 22px 24px 28px; font: 14.5px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #d4d4d4; white-space: pre-wrap; word-break: break-word;
  }
  .prompt { color: #27c93f; }
  .cmd { color: #eaeaea; }
  .out { color: #a7a7a7; margin-top: 6px; display: block; }
  .more { color: #6a6a6a; font-style: italic; }
  </style></head><body>
  <div class="window">
    <div class="titlebar"><div class="dots"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span></div><div class="title">${escapeHtml(title)}</div></div>
    <div class="body"><span class="prompt">$</span> <span class="cmd">${escapeHtml(command)}</span><span class="out">${escapeHtml(text)}</span>${truncated ? '<div class="more">…output truncated</div>' : ""}</div>
  </div>
  </body></html>`;
}

/** Render a pre-captured command + output into a styled PNG. */
export function renderTerminalCardPng(input: TerminalCardInput, pngPath: string): boolean {
  const chrome = findChrome();
  if (!chrome) return false;
  const htmlPath = pngPath.replace(/\.png$/i, ".tmp.html");
  writeFileSync(htmlPath, terminalHtml(input));
  try {
    execSync(
      `"${chrome}" --headless --disable-gpu --hide-scrollbars ` +
        `--window-size=1060,760 --screenshot="${pngPath}" "file://${htmlPath}"`,
      { stdio: "ignore", timeout: 30_000 },
    );
    return true;
  } finally {
    try {
      unlinkSync(htmlPath);
    } catch {
      /* best effort */
    }
  }
}

/** Run a real command, capture its output, and render the card in one go. */
export function runAndRenderTerminalCard(
  input: { title: string; command: string; cwd?: string },
  pngPath: string,
): { ok: boolean; output: string } {
  let output: string;
  try {
    output = execSync(input.command, {
      cwd: input.cwd,
      encoding: "utf8",
      timeout: 30_000,
    }).toString();
  } catch (e) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    output =
      [err.stdout?.toString(), err.stderr?.toString()].filter(Boolean).join("\n") ||
      err.message ||
      String(e);
  }
  const ok = renderTerminalCardPng({ title: input.title, command: input.command, output }, pngPath);
  return { ok, output };
}
