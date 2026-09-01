import { cn } from "@/lib/utils";
import type { CareerMatch } from "@/lib/db/schema";

const REC_CLASS: Record<string, string> = {
  yes: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  maybe: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  no: "bg-muted text-muted-foreground",
};

function Chips({ items, tone }: { items: string[]; tone: string }) {
  if (items.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((s) => (
        <span key={s} className={cn("rounded-full px-2 py-0.5 text-xs", tone)}>
          {s}
        </span>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

export function MatchReport({ match }: { match: CareerMatch }) {
  const proven = (match.provenMatches ?? []) as string[];
  const implemented = (match.implementedMatches ?? []) as string[];
  const partial = (match.partialMatches ?? []) as {
    skill: string;
    have: string;
    note: string;
  }[];
  const aspirational = (match.aspirationalMatches ?? []) as string[];
  const missing = (match.missingSkills ?? []) as string[];
  const gaps = (match.gapClosingWork ?? []) as {
    gap: string;
    suggestion: string;
  }[];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="text-3xl font-semibold tabular-nums">
          {match.overallScore}
          <span className="text-lg text-muted-foreground">%</span>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-sm font-medium uppercase",
            REC_CLASS[match.recommendation],
          )}
        >
          {match.recommendation}
        </span>
      </div>

      <p className="text-sm">{match.summary}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Proven matches">
          <Chips
            items={proven}
            tone="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          />
        </Section>
        <Section title="Implemented matches">
          <Chips
            items={implemented}
            tone="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
          />
        </Section>
        <Section title="Partial (only learning/practising)">
          {partial.length === 0 ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <ul className="text-sm text-muted-foreground">
              {partial.map((p) => (
                <li key={p.skill}>
                  <span className="text-foreground">{p.skill}</span> — {p.note}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Aspirational (adjacent, not yet)">
          <Chips items={aspirational} tone="bg-muted text-muted-foreground" />
        </Section>
        <Section title="Missing">
          <Chips
            items={missing}
            tone="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
          />
        </Section>
      </div>

      {gaps.length > 0 && (
        <Section title="Work that would close the important gaps">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {gaps.map((g, i) => (
              <li key={i}>
                <span className="font-medium">{g.gap}:</span>{" "}
                <span className="text-muted-foreground">{g.suggestion}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Rationale">
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {match.rationale}
        </p>
      </Section>
    </div>
  );
}
