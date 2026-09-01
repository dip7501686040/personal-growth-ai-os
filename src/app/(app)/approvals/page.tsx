import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Approval Inbox" };

export default function ApprovalsPage() {
  return (
    <PagePlaceholder
      title="Approval Inbox"
      description="Human-in-the-loop gate for important agent actions."
      phase="Phase 9"
      points={[
        "Each item: agent, action, reason, context, expected outcome",
        "Approve / Reject / Provide feedback",
        "Covers skill promotion, starting projects, applying to jobs, publishing content",
      ]}
    />
  );
}
