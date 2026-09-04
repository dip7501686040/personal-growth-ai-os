import { db } from "@/lib/db";
import { knowledgeTaxonomy } from "@/lib/db/schema";
import { getEmbeddingProvider } from "@/lib/embeddings";

/**
 * The secondary classification axis — subject-area tags for knowledge that
 * isn't cleanly "about" one skill/project/etc. (an architecture decision, a
 * debugging lesson, an infra note, ...). Hand-seeded: at this corpus size
 * (dozens of docs) unsupervised topic discovery (BERTopic/HDBSCAN) would
 * overfit noise, not find real structure — revisit empirically once the
 * corpus is a few hundred docs.
 */
export const TAXONOMY: {
  slug: string;
  label: string;
  description: string;
  sortOrder: number;
}[] = [
  {
    slug: "dsa_pattern",
    label: "DSA pattern",
    description:
      "A data-structures-and-algorithms technique or pattern — sliding window, two pointers, prefix sum, recursion, dynamic programming, and similar reusable problem-solving approaches.",
    sortOrder: 10,
  },
  {
    slug: "system_design",
    label: "System design",
    description:
      "Distributed-systems and architecture concepts — scaling, queues, caching, consistency, event sourcing, rate limiting, service boundaries.",
    sortOrder: 20,
  },
  {
    slug: "language_framework",
    label: "Language / framework",
    description:
      "A programming language or framework feature, API, or idiom — TypeScript, Next.js, NestJS, React, Node.js, and similar.",
    sortOrder: 30,
  },
  {
    slug: "tooling",
    label: "Tooling",
    description:
      "A developer tool, CLI, library, or utility and how to use it — build tools, linters, package managers, testing tools.",
    sortOrder: 40,
  },
  {
    slug: "architecture_decision",
    label: "Architecture decision",
    description:
      "A specific decision made on a project and its rationale — why one approach was chosen over another.",
    sortOrder: 50,
  },
  {
    slug: "debugging_lesson",
    label: "Debugging lesson",
    description:
      "A bug, incident, or root-cause investigation and what was learned diagnosing and fixing it.",
    sortOrder: 60,
  },
  {
    slug: "devops_infra",
    label: "DevOps / infra",
    description:
      "Deployment, CI/CD, containers, cloud infrastructure, monitoring, and operational concerns.",
    sortOrder: 70,
  },
  {
    slug: "domain_other",
    label: "Other / domain knowledge",
    description:
      "Domain-specific knowledge that doesn't fit the other categories — business, product, or process knowledge.",
    sortOrder: 80,
  },
];

/** Insert/update the taxonomy rows and (re)embed their label+description centroid. */
export async function seedTaxonomy(): Promise<void> {
  const provider = getEmbeddingProvider();
  const vectors = await provider.embed(
    TAXONOMY.map((t) => `${t.label}. ${t.description}`),
  );

  for (let i = 0; i < TAXONOMY.length; i++) {
    const t = TAXONOMY[i];
    await db
      .insert(knowledgeTaxonomy)
      .values({
        slug: t.slug,
        label: t.label,
        description: t.description,
        sortOrder: t.sortOrder,
        embedding: vectors[i],
        embeddingModel: provider.id,
      })
      .onConflictDoUpdate({
        target: knowledgeTaxonomy.slug,
        set: {
          label: t.label,
          description: t.description,
          sortOrder: t.sortOrder,
          embedding: vectors[i],
          embeddingModel: provider.id,
        },
      });
  }
}
