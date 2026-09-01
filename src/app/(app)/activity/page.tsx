import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Agent Activity" };

export default function ActivityPage() {
  return (
    <PagePlaceholder
      title="Agent Activity"
      description="Agent status board, run timeline, and captured Claude Code development activity."
      phase="Phase 2.5 / 9"
      points={[
        "Live agent statuses (idle / working / completed / waiting approval) via Supabase Realtime",
        "Agent run timeline (agent_events)",
        "Recent Claude Code coding sessions: project, files changed, duration, commits",
      ]}
    />
  );
}
