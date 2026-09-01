"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useActionToast } from "@/components/use-action-toast";
import { createClient } from "@/lib/supabase/client";
import {
  resolveApprovalAction,
  type ActionState,
} from "@/app/(app)/approvals/actions";

export type ApprovalRow = {
  id: string;
  actionType: string;
  agentName: string | null;
  title: string;
  reason: string;
  expectedOutcome: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt: string | null;
  feedback: string | null;
  /** Link to the thing this approval is about, when we can resolve one. */
  link?: string;
};

function ResolveForm({ approvalId }: { approvalId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    resolveApprovalAction,
    null,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="approvalId" value={approvalId} />
      <Textarea
        name="feedback"
        rows={2}
        placeholder="Feedback (optional)"
        className="text-sm"
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          name="decision"
          value="approved"
          size="sm"
          disabled={pending}
        >
          Approve
        </Button>
        <Button
          type="submit"
          name="decision"
          value="rejected"
          size="sm"
          variant="outline"
          disabled={pending}
        >
          Reject
        </Button>
      </div>
    </form>
  );
}

export function ApprovalList({
  userId,
  approvals,
}: {
  userId: string;
  approvals: ApprovalRow[];
}) {
  const router = useRouter();

  // Approvals can be created by an agent or resolved elsewhere; refresh the
  // server data when the table changes rather than hand-merging every field.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`approvals-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "approvals", filter: `user_id=eq.${userId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>
        ) : (
          pending.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle className="text-base">{a.title}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {(a.agentName ?? "system").replace(/_/g, " ")} ·{" "}
                  {a.actionType.replace(/_/g, " ")} ·{" "}
                  {new Date(a.createdAt).toLocaleString()}
                  {a.link && (
                    <>
                      {" · "}
                      <Link href={a.link} className="underline">
                        view
                      </Link>
                    </>
                  )}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="whitespace-pre-wrap text-sm">{a.reason}</p>
                {a.expectedOutcome && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Expected:{" "}
                    </span>
                    {a.expectedOutcome}
                  </p>
                )}
                <ResolveForm approvalId={a.id} />
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {decided.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Decided ({decided.length})
          </h2>
          <div className="divide-y rounded-lg border">
            {decided.map((a) => (
              <div key={a.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>
                    {a.title}
                    {a.link && (
                      <Link href={a.link} className="ml-2 text-xs underline">
                        view
                      </Link>
                    )}
                  </span>
                  <span
                    className={
                      a.status === "approved"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }
                  >
                    {a.status}
                  </span>
                </div>
                {a.feedback && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.feedback}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
