"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format";
import {
  loadOutreachContentAction,
  logTouchpointAction,
  sendDraftAction,
  type OutreachContent,
} from "@/app/(app)/applications/actions";

export interface OutreachDraft {
  id: string;
  to: string;
  subject: string;
  snippet: string;
}

export interface OutreachRow {
  applicationId: string;
  company: string;
  role: string;
  status: string;
  bundleDir: string | null;
  channels: { channel: string; count: number; lastAt: string }[];
  kinds: string[];
  lastAt: string | null;
  nextDueAt: string | null;
  overdue: boolean;
  drafts: OutreachDraft[];
}

const KIND_LABEL: Record<string, string> = {
  submitted: "submitted",
  recruiter_pitch: "recruiter pitch",
  referral_pitch: "referral pitch",
  follow_up_1: "follow-up 1",
  follow_up_2: "follow-up 2",
  interview: "interview",
  note: "note",
};

function suggestedKind(kinds: string[]): string {
  if (kinds.length === 0) return "recruiter_pitch";
  if (kinds.includes("follow_up_1") && !kinds.includes("follow_up_2")) return "follow_up_2";
  if (
    kinds.includes("submitted") ||
    kinds.includes("recruiter_pitch") ||
    kinds.includes("referral_pitch")
  )
    return "follow_up_1";
  return "note";
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied.");
  } catch {
    toast.error("Could not copy — select and copy by hand.");
  }
}

function OutreachCard({ row, gmailReady }: { row: OutreachRow; gmailReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [linkedin, setLinkedin] = useState<OutreachContent | "idle" | "loading" | "empty">(
    "idle",
  );
  const [kind, setKind] = useState(suggestedKind(row.kinds));
  const [note, setNote] = useState("");
  const [channel, setChannel] = useState("other");

  const toast_ = (res: { ok: boolean; message: string } | null) => {
    if (!res) return;
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
    router.refresh();
  };

  const toggleLinkedin = () => {
    if (linkedin !== "idle") {
      setLinkedin("idle");
      return;
    }
    setLinkedin("loading");
    start(async () => {
      const content = await loadOutreachContentAction(row.bundleDir);
      setLinkedin(content ?? "empty");
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.company}</span>
        <span className="text-muted-foreground">{row.role}</span>
        <Badge variant="outline">{row.status}</Badge>
        {row.overdue && <Badge variant="destructive">overdue</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">
          {row.channels.length
            ? row.channels.map((c) => `${c.channel}×${c.count}`).join(" · ")
            : "no touchpoints yet"}
          {row.nextDueAt && ` · next due ${fmtDateTime(row.nextDueAt)}`}
        </span>
      </div>

      {gmailReady && row.drafts.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-md border border-dashed p-2">
          <span className="text-xs font-medium">Gmail drafts</span>
          {row.drafts.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="truncate">{d.subject || "(no subject)"}</span>
              <span className="truncate text-muted-foreground">→ {d.to || "(no to)"}</span>
              <select
                className="ml-auto rounded border bg-background px-1 py-0.5 text-xs"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {Object.entries(KIND_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  start(async () =>
                    toast_(await sendDraftAction({ applicationId: row.applicationId, draftId: d.id, kind })),
                  )
                }
              >
                Send
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          className="w-fit text-xs text-muted-foreground underline"
          onClick={toggleLinkedin}
        >
          {linkedin === "idle" ? "Show LinkedIn note/message" : "Hide LinkedIn note/message"}
        </button>
        {linkedin === "loading" && (
          <p className="text-xs text-muted-foreground">loading…</p>
        )}
        {linkedin === "empty" && (
          <p className="text-xs text-muted-foreground">
            No bundle folder linked to this application yet — pitch files live in{" "}
            <code className="text-[11px]">applications/&lt;date&gt;/&lt;folder&gt;</code>.
          </p>
        )}
        {typeof linkedin === "object" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {(["recruiter", "referral"] as const).map((who) => (
              <div key={who} className="flex flex-col gap-1 rounded-md border p-2 text-xs">
                <span className="font-medium capitalize">{who}</span>
                <p className="whitespace-pre-wrap text-muted-foreground">{linkedin[who].note}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{linkedin[who].message}</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => copy(`${linkedin[who].note}\n\n${linkedin[who].message}`)}>
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      start(async () =>
                        toast_(
                          await logTouchpointAction({
                            applicationId: row.applicationId,
                            kind: who === "recruiter" ? "recruiter_pitch" : "referral_pitch",
                            channel: "linkedin",
                          }),
                        ),
                      )
                    }
                  >
                    I sent it
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
        <span className="text-xs text-muted-foreground">log follow-up sent:</span>
        <select
          className="rounded border bg-background px-1 py-0.5 text-xs"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {Object.entries(KIND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="rounded border bg-background px-1 py-0.5 text-xs"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
          {["other", "email", "linkedin", "whatsapp", "portal", "twitter"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          className="min-w-[8rem] flex-1 rounded border bg-background px-1.5 py-0.5 text-xs"
          placeholder="note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await logTouchpointAction({
                applicationId: row.applicationId,
                kind,
                channel,
                note,
              });
              setNote("");
              toast_(res);
            })
          }
        >
          Log
        </Button>
      </div>
    </div>
  );
}

export function OutreachBoard({
  rows,
  gmailReady,
}: {
  rows: OutreachRow[];
  gmailReady: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No open applications with touchpoints yet.
      </p>
    );
  }
  const sorted = [...rows].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
  });
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((r) => (
        <OutreachCard key={r.applicationId} row={r} gmailReady={gmailReady} />
      ))}
    </div>
  );
}
