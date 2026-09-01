import assert from "node:assert/strict";
import { test } from "node:test";
import { toGeminiSchema, toOpenAiSchema } from "../src/lib/llm/schema.ts";
import {
  ContentOpportunitiesSchema,
  LinkedInDraftSchema,
} from "../src/modules/agents/content-schemas.ts";
import { MockProvider } from "../src/lib/llm/mock.ts";

test("content schemas convert for both providers", () => {
  assert.doesNotThrow(() => toGeminiSchema(ContentOpportunitiesSchema));
  assert.doesNotThrow(() => toOpenAiSchema(ContentOpportunitiesSchema));
  assert.doesNotThrow(() => toGeminiSchema(LinkedInDraftSchema));
  assert.doesNotThrow(() => toOpenAiSchema(LinkedInDraftSchema));
});

test("opportunities schema parses and caps at 6", () => {
  const ok = ContentOpportunitiesSchema.parse({
    opportunities: [
      { title: "t", hook: "h", angle: "a", sourceKey: "PF1" },
    ],
  });
  assert.equal(ok.opportunities[0].sourceKey, "PF1");
  assert.throws(() =>
    ContentOpportunitiesSchema.parse({
      opportunities: Array.from({ length: 7 }, () => ({
        title: "t",
        hook: "h",
        angle: "a",
        sourceKey: "X",
      })),
    }),
  );
});

test("MockProvider round-trips a LinkedIn draft", async () => {
  const mock = new MockProvider({
    structuredResponse: { title: "What I learned wiring retries", body: "Long ago..." },
  });
  const out = await mock.generateStructured({
    schema: LinkedInDraftSchema,
    schemaName: "linkedin_draft",
    prompt: "x",
    model: "mock",
  });
  assert.equal(out.data.title, "What I learned wiring retries");
});
