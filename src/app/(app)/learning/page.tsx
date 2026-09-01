import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Learning" };

export default function LearningPage() {
  return (
    <PagePlaceholder
      title="Learning"
      description="Track topics, technologies, system design and DSA pattern-recognition practice."
      phase="Phase 3"
      points={[
        "Log learning sessions with confidence before/after",
        "Manual DSA problem + attempt entry (patterns, hints, time, failure reason)",
        "Learning Agent: daily plan with reasons, pattern-weakness analysis",
      ]}
    />
  );
}
