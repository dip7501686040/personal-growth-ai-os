import { z } from "zod";
import { toGeminiSchema } from "./schema";
import {
  LlmError,
  type GenerateOptions,
  type GenerateResult,
  type GenerateStructuredOptions,
  type GenerateStructuredResult,
  type LLMProvider,
} from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string };
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini" as const;

  constructor(private readonly apiKey: string) {}

  private async call(
    model: string,
    body: Record<string, unknown>,
  ): Promise<{ text: string; usage: GenerateResult["usage"] }> {
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      throw new LlmError(
        json.error?.message ?? `Gemini HTTP ${res.status}`,
        "gemini",
        res.status,
      );
    }

    const text = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) {
      throw new LlmError(
        `Gemini returned no text (finishReason: ${json.candidates?.[0]?.finishReason ?? "unknown"})`,
        "gemini",
      );
    }

    return {
      text,
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount ?? null,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? null,
      },
    };
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    return this.call(opts.model, {
      ...(opts.system
        ? { system_instruction: { parts: [{ text: opts.system }] } }
        : {}),
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
      },
    });
  }

  async generateStructured<T>(
    opts: GenerateStructuredOptions<T>,
  ): Promise<GenerateStructuredResult<T>> {
    const { text, usage } = await this.call(opts.model, {
      ...(opts.system
        ? { system_instruction: { parts: [{ text: opts.system }] } }
        : {}),
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(opts.schema),
      },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new LlmError("Gemini structured output was not valid JSON", "gemini");
    }
    const result = opts.schema.safeParse(parsed);
    if (!result.success) {
      throw new LlmError(
        `Gemini output failed schema validation: ${z.prettifyError(result.error)}`,
        "gemini",
      );
    }
    return { data: result.data, raw: text, usage };
  }
}
