import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Career" };

export default function CareerPage() {
  return (
    <PagePlaceholder
      title="Career"
      description="Analyze manually entered jobs against your real proof-of-skills profile."
      phase="Phase 5"
      points={[
        "Paste company, role, job description",
        "Honest match: proven / implemented / partial / missing, score, YES / MAYBE / NO",
        "Suggested project work to close important gaps — no auto-apply",
      ]}
    />
  );
}
