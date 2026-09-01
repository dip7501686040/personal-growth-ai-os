import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/user";
import { getOpportunity } from "@/modules/business/service";
import { OpportunityForm } from "@/components/business/opportunity-form";
import { deleteOpportunityAction } from "@/app/(app)/business/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const o = await getOpportunity(userId, id);
  return { title: o ? `${o.title} · Business` : "Business" };
}

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const o = await getOpportunity(userId, id);
  if (!o) notFound();

  const tech = (o.techStack ?? []) as string[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/business"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Business Opportunities
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{o.title}</h1>
          <Badge variant="secondary">{o.status}</Badge>
          <Badge variant="outline">{o.complexity}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">The opportunity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Problem
            </p>
            <p>{o.problem}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Target customer
            </p>
            <p>{o.targetCustomer}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Build scope
            </p>
            <p>{o.buildScope ?? "—"}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm">
              <span className="font-semibold tabular-nums">
                {o.skillMatchScore}%
              </span>{" "}
              skill match
            </span>
            {tech.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tech.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your notes & status</CardTitle>
        </CardHeader>
        <CardContent>
          <OpportunityForm
            id={o.id}
            status={o.status}
            notes={o.notes ?? ""}
            proposedSolution={o.proposedSolution}
            monetizationModel={o.monetizationModel ?? ""}
          />
        </CardContent>
      </Card>

      <form action={deleteOpportunityAction}>
        <input type="hidden" name="id" value={o.id} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="text-destructive"
        >
          Delete
        </Button>
      </form>
    </div>
  );
}
