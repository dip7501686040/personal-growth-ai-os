import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Business Opportunities" };

export default function BusinessPage() {
  return (
    <PagePlaceholder
      title="Business Opportunities"
      description="Realistic small software/AI opportunities a solo developer could build and sell."
      phase="Phase 7"
      points={[
        "Define market, business type, known problems",
        "Generated opportunities: problem, customer, solution, skill match, complexity, monetization",
        "Research and recommendations only — no outreach or scraping",
      ]}
    />
  );
}
