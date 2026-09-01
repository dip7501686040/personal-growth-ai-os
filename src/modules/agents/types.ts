import type { AgentName } from "@/lib/llm";

export type AgentTrigger = "schedule" | "manual" | "chain";

export interface AgentContext {
  userId: string;
  agentRunId: string;
  trigger: AgentTrigger;
  /** Per-run input for target-specific agents (e.g. { opportunityId }). */
  input: Record<string, unknown>;
  /** Append a line to the run's event log. */
  log: (
    message: string,
    opts?: {
      level?: "info" | "warn" | "error";
      step?: string;
      data?: unknown;
    },
  ) => Promise<void>;
}

export interface AgentResult {
  /** Structured payload stored on agent_runs.result and rendered in the UI. */
  result: unknown;
  /** Short human-readable summary. */
  summary: string;
  /** True if the run should end in `waiting_for_approval`. */
  needsApproval?: boolean;
}

export interface AgentRunOptions {
  userId: string;
  trigger: AgentTrigger;
  /** Stable key for idempotency (e.g. an ISO date). */
  triggerKey?: string;
  /** Re-run even if a completed run exists for this triggerKey. */
  force?: boolean;
  /** Per-run input for target-specific agents (e.g. { opportunityId }). */
  input?: Record<string, unknown>;
}

export type { AgentName };
