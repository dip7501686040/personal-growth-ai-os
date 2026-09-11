import { execSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { findChrome } from "@/lib/chrome";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface BrowserCardInput {
  /** shown in the mac-browser address bar */
  url: string;
  /** a raw screenshot PNG already captured (e.g. via Playwright) */
  screenshotPath: string;
}

function toDataUri(path: string): string {
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}

function browserHtml({ url, screenshotPath }: BrowserCardInput): string {
  const img = toDataUri(screenshotPath);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#0b0b0c;display:flex;justify-content:center;padding:24px;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .window{width:1180px;border-radius:10px;overflow:hidden;background:#1e1e1e;
      box-shadow:0 20px 60px rgba(0,0,0,.5)}
    .titlebar{height:44px;background:#2b2b2b;display:flex;align-items:center;padding:0 14px;gap:10px}
    .dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
    .dot.r{background:#ff5f56}.dot.y{background:#ffbd2e}.dot.g{background:#27c93f}
    .addr{flex:1;margin:0 10px;background:#141414;border:1px solid #333;border-radius:7px;
      padding:6px 14px;color:#bbb;font-size:12.5px;text-align:center;overflow:hidden;
      text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    .lock{color:#7a7;margin-right:2px}
    .shot{width:100%;display:block;background:#fff}
  </style></head><body>
    <div class="window">
      <div class="titlebar">
        <div class="dot r"></div><div class="dot y"></div><div class="dot g"></div>
        <div class="addr"><span class="lock">🔒</span>${escapeHtml(url)}</div>
      </div>
      <img class="shot" src="${img}" />
    </div>
  </body></html>`;
}

/** Frames an already-captured raw screenshot as a macOS-browser window — the
 *  UI-facing counterpart to terminal-card.ts's macOS-terminal framing. Both
 *  use the same technique (an HTML doc screenshotted by headless Chrome) so
 *  the two card styles look like a matched pair. */
export function renderBrowserCardPng(input: BrowserCardInput, pngPath: string): boolean {
  const chrome = findChrome();
  if (!chrome) return false;
  const htmlPath = pngPath.replace(/\.png$/i, ".tmp.html");
  writeFileSync(htmlPath, browserHtml(input));
  try {
    execSync(
      `"${chrome}" --headless --disable-gpu --hide-scrollbars ` +
        `--window-size=1240,1000 --screenshot="${pngPath}" "file://${htmlPath}"`,
      { stdio: "ignore", timeout: 30_000 },
    );
    return true;
  } finally {
    try {
      unlinkSync(htmlPath);
    } catch {
      // best effort
    }
  }
}
