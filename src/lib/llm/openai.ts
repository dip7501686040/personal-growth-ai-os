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

const URL = "https://api.openai.com/v1/chat/completions";

interface ChatResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai" as const;

  constructor(private readonly apiKey: string) {}

  private async call(
    body: Record<string, unknown>,
  ): Promise<{ text: string; usage: GenerateResult["usage"] }> {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok) {
      throw new LlmError(
        json.error?.message ?? `OpenAI HTTP ${res.status}`,
        "openai",
        res.status,
      );
    }

    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new LlmError("OpenAI returned no content", "openai");
    }

    return {
      text,
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? null,
        outputTokens: json.usage?.completion_tokens ?? null,
      },
    };
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    return this.call({
      model: opts.model,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: opts.prompt },
      ],
      temperature: opts.temperature ?? 0.4,
    });
  }

  async generateStructured<T>(
    opts: GenerateStructuredOptions<T>,
  ): Promise<GenerateStructuredResult<T>> {
    const { text, usage } = await this.call({
      model: opts.model,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: opts.prompt },
      ],
      temperature: opts.temperature ?? 0.3,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: opts.schemaName ?? "response",
          strict: true,
          schema: toOpenAiSchema(opts.schema),
        },
      },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new LlmError("OpenAI structured output was not valid JSON", "openai");
    }
    const result = opts.schema.safeParse(parsed);
    if (!result.success) {
      throw new LlmError(
        `OpenAI output failed schema validation: ${z.prettifyError(result.error)}`,
        "openai",
      );
    }
    return { data: result.data, raw: text, usage };
  }
}
