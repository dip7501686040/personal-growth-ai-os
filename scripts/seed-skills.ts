/**
 * One-off seed: create skills from Dipankar's resume/portfolio.
 *
 *   pnpm db:seed
 *
 * Every skill is seeded at PRACTICED with a single "manual / moderate" evidence
 * row (self-reported). That's the honest ceiling for self-report — Implemented
 * and Proven require project features or captured development activity, which
 * arrive in later phases. Idempotent: existing skills (by slug) are skipped.
 */
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { skillEvidence, skills } from "../src/lib/db/schema/index.ts";
import { slugify } from "../src/lib/slug.ts";
import { deriveLevel } from "../src/modules/skills/progression.ts";
import type { SkillCategory } from "../src/modules/skills/levels.ts";

type Seed = { name: string; category: SkillCategory; note?: string };

const SEED: Seed[] = [
  // languages
  { name: "TypeScript", category: "language" },
  { name: "JavaScript (ES6+)", category: "language" },
  // frameworks
  { name: "Node.js", category: "framework" },
  { name: "NestJS", category: "framework" },
  { name: "React", category: "framework" },
  { name: "Next.js", category: "framework" },
  { name: "Angular", category: "framework", note: "Used at TCS on Zurich Insurance apps." },
  { name: "Tailwind CSS", category: "framework" },
  // databases
  { name: "PostgreSQL", category: "database" },
  { name: "MySQL", category: "database" },
  { name: "MongoDB", category: "database" },
  { name: "Redis", category: "database" },
  { name: "Prisma", category: "database" },
  // infrastructure
  { name: "Docker", category: "infrastructure" },
  { name: "Kubernetes", category: "infrastructure" },
  { name: "AWS", category: "infrastructure", note: "EC2, S3, EKS." },
  { name: "Nginx", category: "infrastructure" },
  { name: "GitHub Actions", category: "infrastructure" },
  { name: "Jenkins", category: "infrastructure" },
  // tools
  { name: "RabbitMQ", category: "tool", note: "Event-driven notification platform; DLX, retry consumers." },
  { name: "gRPC", category: "tool" },
  { name: "OpenTelemetry", category: "tool" },
  { name: "Prometheus", category: "tool" },
  { name: "Grafana", category: "tool" },
  { name: "Jaeger", category: "tool" },
  { name: "Loki", category: "tool" },
  { name: "Git", category: "tool" },
  { name: "OpenAI API", category: "tool" },
  // concepts
  { name: "REST API Design", category: "concept" },
  { name: "GraphQL", category: "concept" },
  { name: "Microservices", category: "concept" },
  { name: "Event-Driven Architecture", category: "concept" },
  { name: "System Design", category: "concept", note: "HLD/LLD for the notification platform." },
  { name: "Authentication & Authorization", category: "concept", note: "JWT, OAuth2, RBAC." },
  { name: "Message Queues", category: "concept" },
  { name: "CI/CD", category: "concept" },
  { name: "Generative AI", category: "concept" },
  // practices
  { name: "Prompt Engineering", category: "practice" },
  { name: "LLM Workflow Design", category: "practice" },
  { name: "Query Optimization & Indexing", category: "practice" },
  { name: "Code Review", category: "practice" },
  { name: "Mentoring Engineers", category: "practice" },
  { name: "Agile / Scrum", category: "practice" },
];

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const ownerEmail = (process.env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim();
  if (!url) throw new Error("DIRECT_URL / DATABASE_URL not set.");
  if (!ownerEmail) throw new Error("ALLOWED_EMAILS not set.");

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  const rows = await client<{ id: string }[]>`
    select id from auth.users where email = ${ownerEmail} limit 1
  `;
  const userId = rows[0]?.id;
  if (!userId) {
    await client.end();
    throw new Error(
      `No auth.users row for ${ownerEmail}. Add the user in the Supabase dashboard first.`,
    );
  }

  const derived = deriveLevel([
    {
      id: "seed",
      sourceType: "manual",
      sourceId: null,
      supportsLevel: "practiced",
      strength: "moderate",
    },
  ]);

  let created = 0;
  let skipped = 0;

  for (const s of SEED) {
    const slug = slugify(s.name);
    const existing = await db
      .select({ id: skills.id })
      .from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.slug, slug)))
      .limit(1);
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const [skill] = await db
      .insert(skills)
      .values({
        userId,
        name: s.name,
        slug,
        category: s.category,
        level: derived.level,
        confidence: derived.confidence,
        lastActivityAt: new Date(),
      })
      .returning({ id: skills.id });

    await db.insert(skillEvidence).values({
      userId,
      skillId: skill.id,
      sourceType: "manual",
      summary: "Self-reported from resume and portfolio (2020–2026)",
      detail: s.note ?? null,
      strength: "moderate",
      supportsLevel: "practiced",
      status: "accepted",
      createdBy: "user",
      decidedAt: new Date(),
    });
    created++;
  }

  await client.end();
  console.log(
    `Seed complete: ${created} skill(s) created, ${skipped} already present.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
