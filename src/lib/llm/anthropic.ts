import { z } from "zod";
import { toOpenAiSchema } from "./schema";
import {
  LlmError,
  type GenerateOptions,
  type GenerateResult,
  type GenerateStructuredOptions,
  type GenerateStructuredResult,
  type LLMProvider,
} from "./types";

const URL = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

/**
 * Raw-`fetch` Anthropic Messages client — deliberately mirrors `gemini.ts` /
 * `openai.ts` (thin wrapper, no provider SDK) so all three providers share one
 * shape and `runStructured` keeps owning retry/fallback.
 *
 * Sonnet 5 specifics baked in: `temperature`/`top_p`/`top_k` are rejected (400)
 * so we never send them; thinking runs adaptively (param omitted); structured
 * output is a forced `tool_use` with `strict: true` — the most reliable
 * raw-HTTP path for schema-valid JSON.
 */
interface AnthropicResponse {
  content?: (
    | { type: "text"; text?: string }
    | { type: "tool_use"; name?: string; input?: unknown }
    | { type: string; [k: string]: unknown }
  )[];
  stop_reason?: string;
  stop_details?: { category?: string | null; explanation?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;

  constructor(private readonly apiKey: string) {}

  private async call(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<AnthropicResponse> {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": VERSION,
      },
      body: JSON.stringify(body),
      signal,
    });

    const json = (await res.json().catch(() => ({}))) as AnthropicResponse;
    if (!res.ok) {
      throw new LlmError(
        json.error?.message ?? `Anthropic HTTP ${res.status}`,
        "anthropic",
        res.status,
      );
    }
    if (json.stop_reason === "refusal") {
      throw new LlmError(
        `Anthropic refused (${json.stop_details?.category ?? "unspecified"})`,
        "anthropic",
      );
    }
    return json;
  }

  private effort(level: GenerateOptions["thinkingLevel"]): "low" | "high" {
    return level === "high" ? "high" : "low";
  }

  private usageOf(json: AnthropicResponse): GenerateResult["usage"] {
    return {
      inputTokens: json.usage?.input_tokens ?? null,
      outputTokens: json.usage?.output_tokens ?? null,
    };
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const json = await this.call(
      {
        model: opts.model,
        max_tokens: opts.maxOutputTokens ?? 8192,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: "user", content: opts.prompt }],
        output_config: { effort: this.effort(opts.thinkingLevel) },
      },
      opts.signal,
    );

    const text = json.content
      ?.filter((b): b is { type: "text"; text?: string } => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    if (!text) {
      throw new LlmError(
        `Anthropic returned no text (stop_reason: ${json.stop_reason ?? "unknown"})`,
        "anthropic",
      );
    }
    return { text, usage: this.usageOf(json) };
  }

  async generateStructured<T>(
    opts: GenerateStructuredOptions<T>,
  ): Promise<GenerateStructuredResult<T>> {
    const toolName = opts.schemaName ?? "respond";
    const json = await this.call(
      {
        model: opts.model,
        max_tokens: opts.maxOutputTokens ?? 8192,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: "user", content: opts.prompt }],
        output_config: { effort: this.effort(opts.thinkingLevel) },
        tools: [
          {
            name: toolName,
            description: "Return the structured response for this request.",
            input_schema: toOpenAiSchema(opts.schema),
            strict: true,
          },
        ],
        tool_choice: { type: "tool", name: toolName },
      },
      opts.signal,
    );

    const toolUse = json.content?.find(
      (b): b is { type: "tool_use"; name?: string; input?: unknown } =>
        b.type === "tool_use",
    );
    if (!toolUse) {
      throw new LlmError(
        `Anthropic returned no tool_use block (stop_reason: ${json.stop_reason ?? "unknown"})`,
        "anthropic",
      );
    }

    const result = opts.schema.safeParse(toolUse.input);
    if (!result.success) {
      throw new LlmError(
        `Anthropic output failed schema validation: ${z.prettifyError(result.error)}`,
        "anthropic",
      );
    }
    return {
      data: result.data,
      raw: JSON.stringify(toolUse.input),
      usage: this.usageOf(json),
    };
  }
}
