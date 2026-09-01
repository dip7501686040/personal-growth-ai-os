import type {
  GenerateOptions,
  GenerateResult,
  GenerateStructuredOptions,
  GenerateStructuredResult,
  LLMProvider,
} from "./types";

/**
 * Deterministic provider for tests. `structuredResponses` maps schemaName →
 * the object to return; `textResponse` is returned by `generate`.
 */
export class MockProvider implements LLMProvider {
  readonly name = "gemini" as const;
  calls: { kind: "generate" | "structured"; opts: unknown }[] = [];

  constructor(
    private readonly opts: {
      textResponse?: string;
      structuredResponses?: Record<string, unknown>;
      structuredResponse?: unknown;
    } = {},
  ) {}

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    this.calls.push({ kind: "generate", opts });
    return {
      text: this.opts.textResponse ?? "mock response",
      usage: { inputTokens: 10, outputTokens: 20 },
    };
  }

  async generateStructured<T>(
    opts: GenerateStructuredOptions<T>,
  ): Promise<GenerateStructuredResult<T>> {
    this.calls.push({ kind: "structured", opts });
    const candidate =
      this.opts.structuredResponses?.[opts.schemaName ?? "response"] ??
      this.opts.structuredResponse;
    const data = opts.schema.parse(candidate);
    return {
      data,
      raw: JSON.stringify(data),
      usage: { inputTokens: 10, outputTokens: 20 },
    };
  }
}
