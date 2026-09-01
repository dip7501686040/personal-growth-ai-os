import assert from "node:assert/strict";
import { test } from "node:test";
import { toGeminiSchema, toOpenAiSchema } from "../src/lib/llm/schema.ts";
import { BusinessOpportunitiesSchema } from "../src/modules/agents/business-schema.ts";
import { MockProvider } from "../src/lib/llm/mock.ts";

const sample = {
  opportunities: [
    {
      title: "WhatsApp booking automation for clinics",
      problem: "Clinics lose after-hours appointment requests.",
      targetCustomer: "Single-location clinics",
      proposedSolution: "WhatsApp bot books against an availability table and sends reminders.",
      techStack: ["Node.js", "PostgreSQL", "REST API Design"],
      skillMatchScore: 80,
      complexity: "medium",
      buildScope: "~1-2 weeks: webhook, slot model, admin page, reminder cron.",
      monetizationModel: "Monthly subscription + setup fee.",
    },
  ],
};

test("BusinessOpportunitiesSchema converts for both providers", () => {
  assert.doesNotThrow(() => toGeminiSchema(BusinessOpportunitiesSchema));
  assert.doesNotThrow(() => toOpenAiSchema(BusinessOpportunitiesSchema));
});

test("parses a well-formed set", () => {
  const p = BusinessOpportunitiesSchema.parse(sample);
  assert.equal(p.opportunities[0].complexity, "medium");
  assert.equal(p.opportunities[0].skillMatchScore, 80);
});

test("rejects empty opportunity list", () => {
  assert.throws(() =>
    BusinessOpportunitiesSchema.parse({ opportunities: [] }),
  );
});

test("rejects an empty tech stack", () => {
  assert.throws(() =>
    BusinessOpportunitiesSchema.parse({
      opportunities: [{ ...sample.opportunities[0], techStack: [] }],
    }),
  );
});

test("MockProvider round-trips", async () => {
  const mock = new MockProvider({ structuredResponse: sample });
  const out = await mock.generateStructured({
    schema: BusinessOpportunitiesSchema,
    schemaName: "business_opportunities",
    prompt: "x",
    model: "mock",
  });
  assert.equal(out.data.opportunities[0].title, sample.opportunities[0].title);
});
