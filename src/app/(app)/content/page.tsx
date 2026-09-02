import Link from "next/link";
import { requireUserId } from "@/lib/user";
import { listContentItems } from "@/modules/content/service";
import { getAgentConsole, getLatestRun } from "@/modules/agents/runs";
import { AgentRunConsole } from "@/components/agent-run-console";
import { NewIdeaDialog } from "@/components/content/new-idea-dialog";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Content" };

const COLUMNS: { status: string; label: string }[] = [
  { status: "idea", label: "Ideas" },
  { status: "draft", label: "Drafts" },
  { status: "ready_for_review", label: "Ready for review" },
  { status: "approved", label: "Approved" },
  { status: "published", label: "Published" },
];

export default async function ContentPage() {
  const userId = await requireUserId();
  const [items, run, contentConsole] = await Promise.all([
    listContentItems(userId),
    getLatestRun(userId, "content"),
    getAgentConsole(userId, "content"),
  ]);

  const lastNote =
    run?.result && typeof run.result === "object" && "note" in run.result
      ? String((run.result as { note?: unknown }).note ?? "")
      : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build-in-public LinkedIn posts, grounded in your real work. Drafts
            only — you post manually.
          </p>
        </div>
        <NewIdeaDialog />
      </div>

      <div className="flex flex-col gap-1">
        <AgentRunConsole
          agent="content"
          userId={userId}
          label="Scan for content"
          initial={contentConsole}
        />
        {lastNote && (
          <p className="text-sm text-muted-foreground">Last run: {lastNote}</p>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Run &quot;Scan for content&quot; after logging some
            learning or shipping a feature.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {COLUMNS.map(({ status, label }) => {
            const col = items.filter((i) => i.status === status);
            if (col.length === 0) return null;
            return (
              <section key={status} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {label} ({col.length})
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {col.map((i) => (
                    <Link
                      key={i.id}
                      href={`/content/${i.id}`}
                      className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <p className="text-sm font-medium">{i.title}</p>
                      {i.hook && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {i.hook}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {i.sourceCount} source{i.sourceCount === 1 ? "" : "s"}
                        {i.body ? " · has draft" : ""}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
