import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { toGeminiSchema, toOpenAiSchema } from "../src/lib/llm/schema.ts";
import { LearningPlanSchema } from "../src/modules/agents/learning-plan-schema.ts";
import { MockProvider } from "../src/lib/llm/mock.ts";

test("toOpenAiSchema: objects get additionalProperties:false and full required", () => {
  const js = toOpenAiSchema(
    z.object({ a: z.string(), b: z.number().optional() }),
  ) as Record<string, unknown>;
  assert.equal(js.additionalProperties, false);
  assert.deepEqual(js.required, ["a", "b"]);
});

test("toGeminiSchema strips additionalProperties and $schema", () => {
  const js = JSON.stringify(
    toGeminiSchema(z.object({ a: z.string(), nested: z.object({ x: z.number() }) })),
  );
  assert.ok(!js.includes("additionalProperties"));
  assert.ok(!js.includes("$schema"));
});

test("LearningPlanSchema converts for both providers without throwing", () => {
  assert.doesNotThrow(() => toGeminiSchema(LearningPlanSchema));
  assert.doesNotThrow(() => toOpenAiSchema(LearningPlanSchema));
});

test("MockProvider returns schema-valid structured data", async () => {
  const sample = {
    dsaWeakness: {
      weakPattern: "Graph Modeling",
      observation: "Solves BFS once the graph is built, misses when a grid is a graph.",
      recommendations: ["Do 2 grid-as-graph problems."],
    },
    dailyPlan: {
      dsa: { topic: "2 multi-source BFS problems", why: "weak pattern" },
      systemDesign: { topic: "Rate limiter", why: "gap in portfolio" },
      technology: { topic: "Idempotent consumers", why: "next step after RabbitMQ" },
      revision: null,
    },
    nextLogicalStep: "Turn RabbitMQ retry into a project feature.",
  };
  const mock = new MockProvider({ structuredResponse: sample });
  const out = await mock.generateStructured({
    schema: LearningPlanSchema,
    schemaName: "learning_plan",
    prompt: "x",
    model: "mock",
  });
  assert.equal(out.data.dsaWeakness?.weakPattern, "Graph Modeling");
  assert.equal(out.data.dailyPlan.revision, null);
});
