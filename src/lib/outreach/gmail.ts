/**
 * Gmail draft + send over the REST API. OAuth credentials and token live in
 * ~/.config/pgai/ (never in the repo). Scope is gmail.compose — this can create
 * and send drafts, and nothing else (no inbox read).
 *
 * Server / script only.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { OAuth2Client } from "google-auth-library";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "openid",
  "email",
];

/** Only call this right before writing — Vercel's filesystem is read-only
 *  outside /tmp, so this throws there. Reading paths/existence never needs it. */
export function configDir(): string {
  const dir = join(homedir(), ".config", "pgai");
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Plain path strings, computed without touching the filesystem — this file
// is imported by /applications (page + server actions), which must still
// render on Vercel even though Gmail is a local-only, file-based feature.
const CONFIG_DIR = join(homedir(), ".config", "pgai");
const CRED_PATH = join(CONFIG_DIR, "gmail-credentials.json");
const TOKEN_PATH = join(CONFIG_DIR, "gmail-token.json");

export function credentialsExist(): boolean {
  return existsSync(CRED_PATH);
}
export function tokenExists(): boolean {
  return existsSync(TOKEN_PATH);
}

type ClientSecret = {
  installed?: { client_id: string; client_secret: string; redirect_uris?: string[] };
  web?: { client_id: string; client_secret: string; redirect_uris?: string[] };
};

/** OAuth2 client from the downloaded Desktop client-secret JSON. */
export function oauthClient(redirectUri?: string): OAuth2Client {
  if (!credentialsExist()) {
    throw new Error(
      `Gmail OAuth client not found at ${CRED_PATH}. In Google Cloud Console → ` +
        `APIs & Services → Credentials, create an OAuth client ID of type ` +
        `"Desktop app", download the JSON, and save it there.`,
    );
  }
  const raw = JSON.parse(readFileSync(CRED_PATH, "utf8")) as ClientSecret;
  const c = raw.installed ?? raw.web;
  if (!c) throw new Error("gmail-credentials.json has neither an `installed` nor `web` client.");
  return new OAuth2Client({
    clientId: c.client_id,
    clientSecret: c.client_secret,
    redirectUri: redirectUri ?? "http://127.0.0.1",
  });
}

export function saveToken(tokens: unknown): void {
  configDir(); // ensure ~/.config/pgai exists — local-only call path, never reached on Vercel
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

/** Authorized client, refreshing (and re-persisting) the access token as needed. */
export async function authedClient(): Promise<OAuth2Client> {
  if (!tokenExists()) {
    throw new Error("Not authorized yet — run `pnpm gmail-auth` once.");
  }
  const client = oauthClient();
  client.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, "utf8")));
  client.on("tokens", (t) => {
    const current = JSON.parse(readFileSync(TOKEN_PATH, "utf8"));
    saveToken({ ...current, ...t });
  });
  return client;
}

async function gapi<T>(
  client: OAuth2Client,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const { token } = await client.getAccessToken();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Gmail API ${path} → ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function linkedEmail(client: OAuth2Client): Promise<string> {
  const { token } = await client.getAccessToken();
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return "(unknown account)";
  return ((await res.json()) as { email?: string }).email ?? "(unknown account)";
}

// ── MIME ────────────────────────────────────────────────────────────────────

export interface Attachment {
  path: string;
  contentType?: string;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRaw(msg: {
  to: string;
  subject: string;
  text: string;
  cc?: string;
  attachments?: Attachment[];
}): string {
  const boundary = `pgai_${Date.now().toString(36)}`;
  const head = [
    `To: ${msg.to}`,
    msg.cc ? `Cc: ${msg.cc}` : "",
    `Subject: ${msg.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
  ]
    .filter(Boolean)
    .join("\r\n");

  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    msg.text,
    "",
  ];

  for (const a of msg.attachments ?? []) {
    const data = readFileSync(a.path);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${a.contentType ?? "application/octet-stream"}; name="${basename(a.path)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${basename(a.path)}"`,
      "",
      data.toString("base64").replace(/(.{76})/g, "$1\r\n"),
      "",
    );
  }
  parts.push(`--${boundary}--`, "");

  return b64url(Buffer.from(`${head}\r\n${parts.join("\r\n")}`, "utf8"));
}

// ── draft operations ────────────────────────────────────────────────────────

export interface DraftInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  attachments?: Attachment[];
}

export async function createDraft(
  input: DraftInput,
): Promise<{ id: string; messageId: string }> {
  const client = await authedClient();
  const raw = buildRaw({
    to: input.to,
    subject: input.subject,
    text: input.body,
    cc: input.cc,
    attachments: input.attachments,
  });
  const d = await gapi<{ id: string; message: { id: string } }>(client, "/drafts", {
    method: "POST",
    body: { message: { raw } },
  });
  return { id: d.id, messageId: d.message.id };
}

export async function sendDraft(draftId: string): Promise<{ id: string; threadId: string }> {
  const client = await authedClient();
  return gapi<{ id: string; threadId: string }>(client, "/drafts/send", {
    method: "POST",
    body: { id: draftId },
  });
}

export async function listDrafts(): Promise<
  { id: string; to: string; subject: string; snippet: string }[]
> {
  const client = await authedClient();
  const list = await gapi<{ drafts?: { id: string }[] }>(client, "/drafts?maxResults=25");
  const out: { id: string; to: string; subject: string; snippet: string }[] = [];
  for (const d of list.drafts ?? []) {
    const full = await gapi<{
      message: {
        snippet?: string;
        payload?: { headers?: { name: string; value: string }[] };
      };
    }>(client, `/drafts/${d.id}?format=metadata`);
    const headers = full.message.payload?.headers ?? [];
    const h = (n: string) =>
      headers.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    out.push({
      id: d.id,
      to: h("to"),
      subject: h("subject"),
      snippet: full.message.snippet ?? "",
    });
  }
  return out;
}

/** Best-effort: open a URL in the default browser (macOS `open`, Linux `xdg-open`). */
export function openInBrowser(url: string): void {
  try {
    execFileSync(process.platform === "darwin" ? "open" : "xdg-open", [url], {
      stdio: "ignore",
    });
  } catch {
    /* ignore — we print the URL anyway */
  }
}
