import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/user";
import { getOpportunity } from "@/modules/career/service";
import { listApprovals } from "@/modules/approvals/service";
import { MatchReport } from "@/components/career/match-report";
import { OpportunityActions } from "@/components/career/opportunity-actions";
import { deleteOpportunityAction } from "@/app/(app)/career/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  const data = await getOpportunity(userId, id);
  return { title: data ? `${data.opportunity.role} · ${data.opportunity.company}` : "Career" };
}

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();

  const [data, pendingApprovals] = await Promise.all([
    getOpportunity(userId, id),
    listApprovals(userId, { status: "pending" }),
  ]);
  if (!data) notFound();

  const { opportunity, match } = data;
  const applyPending = pendingApprovals.some(
    (a) =>
      a.actionType === "apply_job" &&
      (a.context as { opportunityId?: string }).opportunityId === id,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/career"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Career
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {opportunity.role}
        </h1>
        <p className="text-sm text-muted-foreground">
          {opportunity.company}
          {opportunity.location ? ` · ${opportunity.location}` : ""}
          {opportunity.jobUrl ? (
            <>
              {" · "}
              <a
                href={opportunity.jobUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                job link
              </a>
            </>
          ) : null}
        </p>
      </div>

      <OpportunityActions
        opportunityId={opportunity.id}
        status={opportunity.status}
        hasMatch={!!match}
        applyPending={applyPending}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Match analysis</CardTitle>
          <CardDescription>
            {match
              ? `Scored ${new Date(match.createdAt).toLocaleString()} against your proof-of-skills`
              : "Not analyzed yet — click Analyze."}
          </CardDescription>
        </CardHeader>
        {match && (
          <CardContent>
            <MatchReport match={match} />
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
            {opportunity.description}
          </p>
        </CardContent>
      </Card>

      <form action={deleteOpportunityAction}>
        <input type="hidden" name="opportunityId" value={opportunity.id} />
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
