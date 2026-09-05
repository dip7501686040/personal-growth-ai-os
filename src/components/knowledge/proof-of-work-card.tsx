import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface ProofOfWorkSkill {
  skillName: string;
  features: { featureTitle: string; projectName: string; projectSlug: string; status: string }[];
}

export interface ProofOfWorkRelated {
  content: { id: string; title: string; status: string }[];
  learning: { id: string; topic: string; category: string }[];
}

/**
 * "A project feature can be supporting document for that job" — real,
 * structural project_skills evidence per matched skill, plus whatever content
 * or learning shares a skill/feature with this entity (the entity_skill_links
 * cross-module bridge, HLD §6). Renders nothing when there's genuinely
 * nothing to show, rather than an empty card.
 */
export function ProofOfWorkCard({
  proof,
  related,
}: {
  proof: ProofOfWorkSkill[];
  related: ProofOfWorkRelated;
}) {
  const hasProof = proof.some((p) => p.features.length > 0);
  const hasRelated = related.content.length > 0 || related.learning.length > 0;
  if (!hasProof && !hasRelated) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Proof of work &amp; related</CardTitle>
        <CardDescription>
          Real shipped project features backing the matched skills, and other
          content/learning that shares a skill or feature with this.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {hasProof && (
          <div className="flex flex-col gap-2">
            {proof
              .filter((p) => p.features.length > 0)
              .map((p) => (
                <div key={p.skillName} className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{p.skillName}</Badge>
                  {p.features.map((f) => (
                    <Link
                      key={`${f.projectSlug}:${f.featureTitle}`}
                      href={`/projects/${f.projectSlug}`}
                      className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    >
                      {f.featureTitle} ({f.projectName})
                    </Link>
                  ))}
                </div>
              ))}
          </div>
        )}

        {hasRelated && (
          <div className="flex flex-col gap-2 text-xs text-muted-foreground">
            {related.content.map((c) => (
              <Link key={c.id} href={`/content/${c.id}`} className="hover:underline">
                Content: {c.title} <span className="text-[10px]">[{c.status}]</span>
              </Link>
            ))}
            {related.learning.map((l) => (
              <span key={l.id}>
                Learning: {l.topic} <span className="text-[10px]">({l.category})</span>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
