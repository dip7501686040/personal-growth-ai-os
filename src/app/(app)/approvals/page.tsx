import { requireUser } from "@/lib/auth";
import { listApprovals } from "@/modules/approvals/service";
import { getSkillById } from "@/modules/skills/service";
import { ApprovalList } from "@/components/approvals/approval-list";

export const metadata = { title: "Approval Inbox" };

async function resolveLink(
  userId: string,
  actionType: string,
  context: unknown,
): Promise<string | undefined> {
  const ctx = (context ?? {}) as Record<string, unknown>;
  switch (actionType) {
    case "promote_skill": {
      const skillId = ctx.skillId;
      if (typeof skillId !== "string") return undefined;
      const skill = await getSkillById(userId, skillId);
      return skill ? `/skills/${skill.slug}` : undefined;
    }
    case "apply_job":
      return typeof ctx.opportunityId === "string"
        ? `/career/${ctx.opportunityId}`
        : undefined;
    case "publish_content":
      return typeof ctx.contentItemId === "string"
        ? `/content/${ctx.contentItemId}`
        : undefined;
    default:
      return undefined;
  }
}

export default async function ApprovalsPage() {
  const user = await requireUser();
  const approvals = await listApprovals(user.id);

  const rows = await Promise.all(
    approvals.map(async (a) => ({
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
      link: await resolveLink(user.id, a.actionType, a.context),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approval Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Human-in-the-loop gate for every important agent action. Nothing here
          happens automatically.
        </p>
      </div>

      <ApprovalList userId={user.id} approvals={rows} />
    </div>
  );
}
