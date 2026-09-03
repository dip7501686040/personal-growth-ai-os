import { enqueueJob } from "../queue";
import type { RawDoc } from "./types";

export const UPLOAD_CATEGORIES = [
  "doc",
  "chatgpt_export",
  "linkedin_shares",
] as const;
export type UploadCategory = (typeof UPLOAD_CATEGORIES)[number];

const MAX_CONVERSATIONS = 150;
const MAX_CONVO_CHARS = 12_000;
const LINKEDIN_BATCH = 15;

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";

// ── ChatGPT conversations.json ─────────────────────────────────────────────

interface ChatNode {
  message?: {
    author?: { role?: string };
    content?: { content_type?: string; parts?: unknown[] };
    create_time?: number | null;
  };
}
interface ChatConversation {
  title?: string;
  conversation_id?: string;
  id?: string;
  create_time?: number;
  mapping?: Record<string, ChatNode>;
}

function linearizeConversation(c: ChatConversation): string {
  const turns: { t: number; who: string; text: string }[] = [];
  for (const node of Object.values(c.mapping ?? {})) {
    const m = node.message;
    const role = m?.author?.role;
    if (!m || (role !== "user" && role !== "assistant")) continue;
    if (m.content?.content_type !== "text") continue;
    const text = (m.content.parts ?? [])
      .filter((p): p is string => typeof p === "string")
      .join("\n")
      .trim();
    if (!text) continue;
    turns.push({
      t: m.create_time ?? 0,
      who: role === "user" ? "User" : "Assistant",
      text,
    });
  }
  turns.sort((a, b) => a.t - b.t);
  return turns
    .map((x) => `${x.who}: ${x.text}`)
    .join("\n\n")
    .slice(0, MAX_CONVO_CHARS);
}

function parseChatGptExport(raw: string): RawDoc[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Not valid JSON — expected ChatGPT conversations.json");
  }
  const conversations: ChatConversation[] = Array.isArray(data)
    ? (data as ChatConversation[])
    : Array.isArray((data as { conversations?: unknown }).conversations)
      ? ((data as { conversations: ChatConversation[] }).conversations)
      : [];
  if (conversations.length === 0) {
    throw new Error("No conversations found in the export");
  }

  const docs: RawDoc[] = [];
  for (const c of conversations.slice(0, MAX_CONVERSATIONS)) {
    const body = linearizeConversation(c);
    if (body.length < 80) continue;
    const id = c.conversation_id || c.id || slug(c.title ?? String(c.create_time));
    const title = c.title?.trim() || "Untitled conversation";
    docs.push({
      kind: "chatgpt_conversation",
      dedupeKey: `chatgpt:${id}`,
      payload: {
        text: `Conversation: ${title}\n\n${body}`,
        title: `ChatGPT — ${title}`,
        sourceKind: "upload",
        sourceRef: `chatgpt:${id}`,
        evidenceSourceType: "conversation",
      },
    });
  }
  if (docs.length === 0) throw new Error("Conversations had no usable text");
  return docs;
}

// ── LinkedIn Shares.csv ────────────────────────────────────────────────────

function parseCsv(raw: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quoted) {
      if (ch === '"' && raw[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

function parseLinkedInShares(raw: string): RawDoc[] {
  const rows = parseCsv(raw);
  const posts = rows
    .map((r) => ({
      date: (r["Date"] || r["date"] || "").slice(0, 10),
      text: (r["ShareCommentary"] || r["Commentary"] || "").trim(),
    }))
    .filter((p) => p.text.length > 20);
  if (posts.length === 0) {
    throw new Error("No post text found (expected a LinkedIn Shares.csv)");
  }

  const docs: RawDoc[] = [];
  for (let i = 0; i < posts.length; i += LINKEDIN_BATCH) {
    const batch = posts.slice(i, i + LINKEDIN_BATCH);
    const body = batch
      .map((p) => `[${p.date}] ${p.text}`)
      .join("\n\n---\n\n");
    docs.push({
      kind: "linkedin_posts",
      dedupeKey: `linkedin:batch:${i / LINKEDIN_BATCH}:${batch[0].date}`,
      payload: {
        text: `LinkedIn posts:\n\n${body}`,
        title: `LinkedIn posts ${i + 1}–${i + batch.length}`,
        sourceKind: "upload",
        sourceRef: `linkedin:batch:${i / LINKEDIN_BATCH}`,
        evidenceSourceType: "linkedin",
      },
    });
  }
  return docs;
}

// ── entry ─────────────────────────────────────────────────────────────────

export function parseUpload(
  category: UploadCategory,
  title: string,
  text: string,
): RawDoc[] {
  if (category === "chatgpt_export") return parseChatGptExport(text);
  if (category === "linkedin_shares") return parseLinkedInShares(text);

  const t = title.trim() || "Pasted document";
  if (text.trim().length < 40) throw new Error("Nothing substantial to ingest");
  return [
    {
      kind: "upload_doc",
      dedupeKey: `upload:${slug(t)}:${text.length}`,
      payload: {
        text,
        title: t,
        sourceKind: "upload",
        sourceRef: `upload:${slug(t)}`,
        evidenceSourceType: "local_doc",
      },
    },
  ];
}

export async function ingestUpload(input: {
  userId: string;
  category: UploadCategory;
  title: string;
  text: string;
}): Promise<{ enqueued: number; deduped: number }> {
  const docs = parseUpload(input.category, input.title, input.text);
  let enqueued = 0;
  let deduped = 0;
  for (const d of docs) {
    const { deduped: wasDup } = await enqueueJob({
      userId: input.userId,
      kind: d.kind,
      dedupeKey: d.dedupeKey,
      payload: d.payload,
    });
    if (wasDup) deduped++;
    else enqueued++;
  }
  return { enqueued, deduped };
}
