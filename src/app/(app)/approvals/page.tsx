import { requireUserId } from "@/lib/user";
import { listApprovals } from "@/modules/approvals/service";
import { ApprovalList } from "@/components/approvals/approval-list";

export const metadata = { title: "Approval Inbox" };

export default async function ApprovalsPage() {
  const userId = await requireUserId();
  const approvals = await listApprovals(userId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approval Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Human-in-the-loop gate for important actions. Phase 2 handles skill
          promotions; agents add more from Phase 3 on.
        </p>
      </div>

      <ApprovalList
        approvals={approvals.map((a) => ({
          id: a.id,
          actionType: a.actionType,
          agentName: a.agentName,
          title: a.title,
          reason: a.reason,
          expectedOutcome: a.expectedOutcome,
          status: a.status,
          createdAt: a.createdAt.toISOString(),
          decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
          feedback: a.feedback,
        }))}
      />
    </div>
  );
}
