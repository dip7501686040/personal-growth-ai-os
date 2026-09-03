"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtNum, fmtTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { AgentConsoleData, ConsoleLine } from "@/modules/agents/runs";
import type { QuotaSummary } from "@/lib/llm/quota";

const WORKING = new Set([
  "triggered",
  "running",
  "gathering_context",
  "analyzing",
  "recommending",
]);

const STATUS_LABEL: Record<string, string> = {
  never_run: "Idle",
  triggered: "Starting",
  running: "Running",
  gathering_context: "Gathering context",
  analyzing: "Analyzing",
  recommending: "Recommending",
  waiting_for_approval: "Waiting for approval",
  completed: "Completed",
  failed: "Failed",
};

const DOT: Record<string, string> = {
  working: "bg-sky-500 animate-pulse",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
  waiting_for_approval: "bg-amber-500",
  idle: "bg-muted-foreground/40",
};

const LEVEL_DOT: Record<string, string> = {
  info: "bg-sky-500/70",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

function dotFor(status: string): string {
  if (WORKING.has(status)) return DOT.working;
  return DOT[status] ?? DOT.idle;
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

interface RawRun {
  id: string;
  agent_name: string;
  status: string;
  model_used: string | null;
  started_at: string | null;
  finished_at: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: string | null;
}

interface Usage {
  in: number;
  out: number;
  cost: number;
}

function usageFrom(
  input: number | null | undefined,
  output: number | null | undefined,
  cost: number | string | null | undefined,
): Usage | null {
  if (input == null && output == null) return null;
  return { in: input ?? 0, out: output ?? 0, cost: cost ? Number(cost) : 0 };
}
interface RawEvent {
  id: string;
  agent_run_id: string;
  ts: string;
  level: string;
  step: string | null;
  message: string;
}

export function AgentRunConsole({
  agent,
  userId,
  label = "Run agent",
  size = "sm",
  input,
  initial,
}: {
  agent: string;
  userId: string;
  label?: string;
  size?: "sm" | "default";
  input?: Record<string, unknown>;
  initial?: AgentConsoleData;
}) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(initial?.status ?? "never_run");
  const [model, setModel] = useState<string | null>(initial?.model ?? null);
  const [lines, setLines] = useState<ConsoleLine[]>(initial?.lines ?? []);
  const [startedAt, setStartedAt] = useState<number | null>(
    initial?.startedAt ? Date.parse(initial.startedAt) : null,
  );
  const [finishedAt, setFinishedAt] = useState<number | null>(
    initial?.finishedAt ? Date.parse(initial.finishedAt) : null,
  );
  const [usage, setUsage] = useState<Usage | null>(
    usageFrom(
      initial?.inputTokens,
      initial?.outputTokens,
      initial?.estimatedCostUsd,
    ),
  );
  const [quota, setQuota] = useState<QuotaSummary | null>(
    initial?.quota ?? null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [stopped, setStopped] = useState(false);
  const [slowStart, setSlowStart] = useState(false);

  const runIdRef = useRef<string | null>(initial?.runId ?? null);
  const seenIds = useRef<Set<string>>(
    new Set(initial?.lines?.map((l) => l.id) ?? []),
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timedOutRef = useRef(false);

  // Give up on a request that never starts streaming (a truly wedged server).
  const RUN_TIMEOUT_MS = 120_000;
  // How long "starting" can take before we tell the user the DB is waking up.
  const SLOW_START_MS = 6_000;

  const running = busy || WORKING.has(status);

  // elapsed depends on the current wall clock — render it only on the client so
  // SSR and the first client render agree (avoids a hydration mismatch)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // elapsed-time ticker
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // realtime: this agent's runs + their events
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`run-console-${agent}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_runs",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as RawRun | undefined;
          if (!n || n.agent_name !== agent) return;
          const isCurrent = runIdRef.current === n.id;
          const isNew = payload.eventType === "INSERT";
          if (!isCurrent && !isNew) return;

          runIdRef.current = n.id;
          setStatus(n.status);
          if (n.model_used) setModel(n.model_used);
          if (n.started_at) setStartedAt(Date.parse(n.started_at));
          setFinishedAt(n.finished_at ? Date.parse(n.finished_at) : null);
          const u = usageFrom(
            n.input_tokens,
            n.output_tokens,
            n.estimated_cost_usd,
          );
          if (u) setUsage(u);
          if (isNew) {
            seenIds.current = new Set();
            setLines([]);
            setUsage(null);
            setOpen(true);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_events",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const e = payload.new as RawEvent | undefined;
          if (!e || e.agent_run_id !== runIdRef.current) return;
          if (seenIds.current.has(e.id)) return;
          seenIds.current.add(e.id);
          setLines((prev) => [
            ...prev,
            { id: e.id, ts: e.ts, level: e.level, step: e.step, message: e.message },
          ]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agent, userId]);

  // keep the log scrolled to the latest line
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, open]);

  function stop() {
    abortRef.current?.abort();
    setStopped(true);
    setStatus("failed");
    setBusy(false);
    setFinishedAt(Date.now());
    toast("Run stopped.");
  }

  async function run() {
    const controller = new AbortController();
    abortRef.current = controller;
    timedOutRef.current = false;
    setBusy(true);
    setStopped(false);
    setSlowStart(false);
    setOpen(true);
    setLines([]);
    seenIds.current = new Set();
    setStartedAt(Date.now());
    setFinishedAt(null);
    setStatus("triggered");
    setModel(null);
    setUsage(null);
    setQuota(null);

    const slowTimer = setTimeout(() => setSlowStart(true), SLOW_START_MS);
    const killTimer = setTimeout(() => {
      timedOutRef.current = true;
      controller.abort();
    }, RUN_TIMEOUT_MS);

    try {
      const res = await fetch(`/api/agents/${agent}/run`, {
        method: "POST",
        headers: input ? { "content-type": "application/json" } : undefined,
        body: input ? JSON.stringify(input) : undefined,
        signal: controller.signal,
      });
      const data = (await res.json()) as {
        id?: string;
        status?: string;
        error?: string | null;
      };

      if (data.id) {
        runIdRef.current = data.id;
        try {
          const full = await fetch(`/api/agents/runs/${data.id}`);
          if (full.ok) {
            const d = (await full.json()) as AgentConsoleData;
            seenIds.current = new Set(d.lines.map((l) => l.id));
            setLines(d.lines);
            setStatus(d.status);
            setModel(d.model);
            setUsage(
              usageFrom(d.inputTokens, d.outputTokens, d.estimatedCostUsd),
            );
            setQuota(d.quota ?? null);
            if (d.startedAt) setStartedAt(Date.parse(d.startedAt));
            setFinishedAt(d.finishedAt ? Date.parse(d.finishedAt) : Date.now());
          }
        } catch {
          // realtime already streamed most of it
        }
      }

      if (!res.ok || data.error || data.status === "failed") {
        toast.error(data.error ?? "Agent run failed.");
        setStatus("failed");
      } else if (data.status === "waiting_for_approval") {
        toast.success("Run finished — needs your approval.");
      } else {
        toast.success("Run complete.");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (timedOutRef.current) {
          toast.error(
            "The run didn't start in time. The database may still be waking up — try again in a moment.",
          );
          setStatus("failed");
          setFinishedAt(Date.now());
        }
        // otherwise the user hit Stop — stop() already updated the UI
      } else {
        toast.error("Could not reach the agent.");
        setStatus("failed");
      }
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(killTimer);
      setSlowStart(false);
      setBusy(false);
      abortRef.current = null;
      router.refresh();
    }
  }

  const elapsed =
    mounted && startedAt != null
      ? fmtElapsed((running ? now : (finishedAt ?? now)) - startedAt)
      : null;

  return (
    <div className="flex flex-col gap-2">
      {busy ? (
        <Button size={size} variant="destructive" onClick={stop}>
          Stop run
        </Button>
      ) : (
        <Button size={size} onClick={run}>
          {label}
        </Button>
      )}

      <div className="rounded-md border bg-muted/40 font-mono text-xs">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 border-b px-3 py-1.5 text-left"
        >
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              stopped ? DOT.waiting_for_approval : dotFor(status),
            )}
          />
          <span className="font-medium">
            {stopped
              ? "Stopped"
              : (STATUS_LABEL[status] ?? status.replace(/_/g, " "))}
          </span>
          <span className="truncate text-muted-foreground">
            {model ? `· ${model}` : status === "never_run" ? "" : "· no model"}
          </span>
          {elapsed && (
            <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
              {elapsed}
            </span>
          )}
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
              !elapsed && "ml-auto",
            )}
          />
        </button>

        <div
          ref={bodyRef}
          className={cn(
            "overflow-y-auto px-3 py-2 leading-relaxed transition-[height] duration-200",
            open ? "h-[340px]" : "h-24",
          )}
        >
          {lines.length === 0 ? (
            <p className="text-muted-foreground">
              {running
                ? slowStart
                  ? "Waking the database… the first run after the app's been idle can take up to a minute."
                  : "Waiting for the first step…"
                : "Run the agent to stream its steps here."}
            </p>
          ) : (
            <ol className="flex flex-col gap-0.5">
              {lines.map((l) => (
                <li key={l.id} className="flex gap-2">
                  <span className="shrink-0 tabular-nums text-muted-foreground/60">
                    {fmtTime(l.ts)}
                  </span>
                  <span
                    className={cn(
                      "mt-1 size-1.5 shrink-0 rounded-full",
                      LEVEL_DOT[l.level] ?? "bg-muted-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      "whitespace-pre-wrap break-words",
                      l.level === "error" && "text-red-600 dark:text-red-400",
                      l.level === "warn" && "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {l.message}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {(usage && (usage.in > 0 || usage.out > 0)) || quota ? (
          <div className="flex flex-col gap-0.5 border-t px-3 py-1 text-[11px] text-muted-foreground">
            {usage && (usage.in > 0 || usage.out > 0) && (
              <div className="flex items-center gap-3">
                <span>
                  <span className="text-foreground tabular-nums">
                    {fmtNum(usage.in)}
                  </span>{" "}
                  in
                </span>
                <span>
                  <span className="text-foreground tabular-nums">
                    {fmtNum(usage.out)}
                  </span>{" "}
                  out
                </span>
                <span className="tabular-nums">
                  {fmtNum(usage.in + usage.out)} total
                </span>
                {usage.cost > 0 && (
                  <span className="ml-auto tabular-nums">
                    ~${usage.cost.toFixed(4)}
                  </span>
                )}
              </div>
            )}
            {quota?.gemini && (
              <div className="tabular-nums">
                Gemini free tier ({quota.model}) ·{" "}
                {quota.gemini.requestsToday}/{quota.gemini.rpd} requests today ·
                ~{fmtNum(quota.gemini.remainingToday)} left · ≈
                {quota.gemini.runsPerMinute}/min
              </div>
            )}
            {quota?.openai && (
              <div className="tabular-nums">
                OpenAI credit · ${quota.openai.spentUsd.toFixed(2)} / $
                {quota.openai.budgetUsd.toFixed(2)} used · ~$
                {quota.openai.remainingUsd.toFixed(2)} left · ≈
                {fmtNum(quota.openai.runsLeftCredit)} runs · ≈
                {fmtNum(quota.openai.runsPerDayRate)}/day (rate)
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
