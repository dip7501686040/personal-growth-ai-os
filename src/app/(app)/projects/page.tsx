import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <PagePlaceholder
      title="Projects"
      description="Turn learning into real projects and map completed features to skills."
      phase="Phase 4"
      points={[
        "Projects with problem, architecture, technologies, status",
        "Features linked to skills (planned / used / demonstrated)",
        "Project Agent: idea suggestions from skill gaps, progress tracking",
      ]}
    />
  );
}
