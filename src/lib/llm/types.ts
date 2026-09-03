import type { ZodType } from "zod";

export type LlmProviderName = "gemini" | "openai";

export type AgentName =
  | "learning"
  | "project"
  | "career"
  | "content"
  | "business"
  | "chief_of_staff"
  | "activity_analyzer";

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface GenerateOptions {
  system?: string;
  prompt: string;
  model: string;
  /** 0–1; lower = more deterministic. */
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Gemini 3+ reasoning effort. Defaults to "low" — our agent tasks are
   * structured extraction/planning, and "high" adds 30–80s of latency.
   * Ignored by providers that don't support it.
   */
  thinkingLevel?: "low" | "high";
  /** Aborts the underlying HTTP request (used to stop a running agent). */
  signal?: AbortSignal;
}

export interface GenerateStructuredOptions<T> extends GenerateOptions {
  schema: ZodType<T>;
  /** Short name used in the JSON-schema wrapper (OpenAI requires one). */
  schemaName?: string;
}

export interface GenerateResult {
  text: string;
  usage: TokenUsage;
}

export interface GenerateStructuredResult<T> {
  data: T;
  raw: string;
  usage: TokenUsage;
}

export interface LLMProvider {
  readonly name: LlmProviderName;
  generate(opts: GenerateOptions): Promise<GenerateResult>;
  generateStructured<T>(
    opts: GenerateStructuredOptions<T>,
  ): Promise<GenerateStructuredResult<T>>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly provider: LlmProviderName,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
