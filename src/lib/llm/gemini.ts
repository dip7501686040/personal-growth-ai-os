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

/** Strip ```json … ``` fences if the model adds them despite JSON mode. */
function stripFences(s: string): string {
  const m = s.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
  return m ? m[1] : s;
}

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
        maxOutputTokens: opts.maxOutputTokens ?? 4096,
        thinkingConfig: { thinkingLevel: opts.thinkingLevel ?? "low" },
      },
    });
  }

  async generateStructured<T>(
    opts: GenerateStructuredOptions<T>,
  ): Promise<GenerateStructuredResult<T>> {
    // JSON mode + schema-in-prompt, NOT responseSchema: with Gemini 3 the
    // strict `responseSchema` path adds ~50s of latency. We validate the
    // result with Zod below, which is the real enforcement.
    const schemaHint = `Respond with a single JSON object, no markdown fences, matching this JSON schema:\n${JSON.stringify(
      toGeminiSchema(opts.schema),
    )}`;

    const { text, usage } = await this.call(opts.model, {
      ...(opts.system
        ? { system_instruction: { parts: [{ text: opts.system }] } }
        : {}),
      contents: [
        {
          role: "user",
          parts: [{ text: `${opts.prompt}\n\n${schemaHint}` }],
        },
      ],
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxOutputTokens ?? 4096,
        thinkingConfig: { thinkingLevel: opts.thinkingLevel ?? "low" },
        responseMimeType: "application/json",
      },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(text));
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
