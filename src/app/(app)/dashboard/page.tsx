import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/nav";

export const metadata = { title: "Dashboard" };

const PANELS = [
  "Today's priorities (Chief of Staff)",
  "Agent statuses",
  "Pending approvals",
  "Recent activity timeline",
  "Recent development activity (Claude Code)",
  "Skill growth summary",
  "Current projects",
  "Content queue",
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The connected view across learning, projects, proof of skills, career,
          content and business. Assembled in Phase 9.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Planned panels</CardTitle>
          <CardDescription>
            Each panel is populated as its owning agent ships.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {PANELS.map((p) => (
              <li
                key={p}
                className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground"
              >
                {p}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sections</CardTitle>
          <CardDescription>Navigate the modules.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {NAV_ITEMS.filter((i) => i.href !== "/dashboard").map((i) => (
              <li key={i.href} className="text-sm">
                <span className="font-medium">{i.label}</span>{" "}
                <span className="text-muted-foreground">— {i.phase}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
