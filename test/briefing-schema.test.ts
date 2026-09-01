import assert from "node:assert/strict";
import { test } from "node:test";
import { toGeminiSchema, toOpenAiSchema } from "../src/lib/llm/schema.ts";
import { BriefingSchema } from "../src/modules/agents/chief-of-staff-schema.ts";
import { MockProvider } from "../src/lib/llm/mock.ts";

const sample = {
  summary: "2 approvals pending, 1 project in flight, 1 job to decide.",
  priorities: [
    {
      title: "Clear 2 approvals",
      why: "Agents are blocked.",
      ref: "Promote RabbitMQ; Publish draft",
      category: "review",
    },
    {
      title: "2 graph-modeling problems",
      why: "Recognition gap in the latest analysis.",
      ref: "DSA: graph modeling",
      category: "dsa",
    },
  ],
  connections: [
    { note: "Shipping the DLQ feature closes the Kafka-adjacent gap the Acme match flagged." },
  ],
};

test("BriefingSchema converts for both providers", () => {
  assert.doesNotThrow(() => toGeminiSchema(BriefingSchema));
  assert.doesNotThrow(() => toOpenAiSchema(BriefingSchema));
});

test("parses a well-formed briefing", () => {
  const p = BriefingSchema.parse(sample);
  assert.equal(p.priorities[0].category, "review");
  assert.equal(p.connections.length, 1);
});

test("rejects an unknown category", () => {
  assert.throws(() =>
    BriefingSchema.parse({
      ...sample,
      priorities: [{ ...sample.priorities[0], category: "misc" }],
    }),
  );
});

test("rejects zero priorities", () => {
  assert.throws(() => BriefingSchema.parse({ ...sample, priorities: [] }));
});

test("MockProvider round-trips", async () => {
  const mock = new MockProvider({ structuredResponse: sample });
  const out = await mock.generateStructured({
    schema: BriefingSchema,
    schemaName: "daily_briefing",
    prompt: "x",
    model: "mock",
  });
  assert.equal(out.data.priorities.length, 2);
});
