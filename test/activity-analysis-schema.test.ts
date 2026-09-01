import assert from "node:assert/strict";
import { test } from "node:test";
import { toGeminiSchema, toOpenAiSchema } from "../src/lib/llm/schema.ts";
import { ActivityAnalysisSchema } from "../src/modules/agents/activity-analysis-schema.ts";
import { MockProvider } from "../src/lib/llm/mock.ts";

const sample = {
  summary: "Implemented resilient message retry and dead-letter handling.",
  workCategories: ["backend", "distributed_system"],
  suggestedSkills: [
    { skill: "RabbitMQ", confidence: 0.85, reason: "Implemented retry + DLQ consumer" },
    { skill: "Retry Patterns", confidence: 0.9, reason: "Exponential backoff in the worker" },
  ],
  potentialProof: ["Implemented asynchronous retry and dead-letter queue handling"],
  contentOpportunities: ["What I learned making message retries reliable"],
};

test("ActivityAnalysisSchema converts for both providers", () => {
  assert.doesNotThrow(() => toGeminiSchema(ActivityAnalysisSchema));
  assert.doesNotThrow(() => toOpenAiSchema(ActivityAnalysisSchema));
});

test("parses the spec's example shape", () => {
  const p = ActivityAnalysisSchema.parse(sample);
  assert.equal(p.suggestedSkills[0].skill, "RabbitMQ");
  assert.equal(p.suggestedSkills[0].confidence, 0.85);
});

test("rejects confidence out of 0..1", () => {
  assert.throws(() =>
    ActivityAnalysisSchema.parse({
      ...sample,
      suggestedSkills: [{ skill: "X", confidence: 5, reason: "y" }],
    }),
  );
});

test("MockProvider round-trips", async () => {
  const mock = new MockProvider({ structuredResponse: sample });
  const out = await mock.generateStructured({
    schema: ActivityAnalysisSchema,
    schemaName: "activity_analysis",
    prompt: "x",
    model: "mock",
  });
  assert.equal(out.data.workCategories.length, 2);
});
