import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Content" };

export default function ContentPage() {
  return (
    <PagePlaceholder
      title="Content"
      description="Build-in-public LinkedIn drafts generated from your real activity."
      phase="Phase 6"
      points={[
        "Content queue: idea → draft → ready for review → approved → published",
        "Drafts cite real learning sessions, project features, activity analyses",
        "LinkedIn only, drafts only — publishing always needs approval",
      ]}
    />
  );
}
