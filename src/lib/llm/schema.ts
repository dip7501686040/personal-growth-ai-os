import { z, type ZodType } from "zod";

type Json = Record<string, unknown>;

function walk(node: unknown, fn: (obj: Json) => void): void {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, fn);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Json;
    fn(obj);
    for (const key of Object.keys(obj)) walk(obj[key], fn);
  }
}

/**
 * JSON Schema for Google Gemini `responseSchema` (an OpenAPI-3.0 subset).
 * Strips keywords Gemini rejects.
 */
export function toGeminiSchema<T>(schema: ZodType<T>): Json {
  const js = z.toJSONSchema(schema, {
    target: "openapi-3.0",
    io: "output",
    unrepresentable: "any",
  }) as Json;
  walk(js, (obj) => {
    delete obj.$schema;
    delete obj.additionalProperties;
    delete obj.default;
    delete obj.format;
    delete obj.const;
  });
  return js;
}

/**
 * JSON Schema for OpenAI `response_format: json_schema` in strict mode:
 * every object needs `additionalProperties: false` and all keys required.
 */
export function toOpenAiSchema<T>(schema: ZodType<T>): Json {
  const js = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "output",
    unrepresentable: "any",
  }) as Json;
  walk(js, (obj) => {
    delete obj.$schema;
    if (obj.type === "object" && obj.properties && typeof obj.properties === "object") {
      obj.additionalProperties = false;
      obj.required = Object.keys(obj.properties as Json);
    }
  });
  return js;
}
