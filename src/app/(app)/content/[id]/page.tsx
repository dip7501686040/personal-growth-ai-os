import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/user";
import { getContentItem } from "@/modules/content/service";
import { listApprovals } from "@/modules/approvals/service";
import { ContentEditor } from "@/components/content/content-editor";
import { ContentPublishControls } from "@/components/content/content-publish-controls";
import { deleteContentAction } from "@/app/(app)/content/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SOURCE_LABEL: Record<string, string> = {
  learning_session: "Learning",
  project_feature: "Project feature",
  dsa_attempt: "DSA",
  dsa_weakness: "DSA weakness",
  skill_levelup: "Skill evidence",
  activity_analysis: "Dev activity",
  manual: "Manual",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const data = await getContentItem(userId, id);
  return { title: data ? `${data.item.title} · Content` : "Content" };
}

export default async function ContentItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();

  const [data, pending] = await Promise.all([
    getContentItem(userId, id),
    listApprovals(userId, { status: "pending" }),
  ]);
  if (!data) notFound();

  const { item, sources } = data;
  const publishPending = pending.some(
    (a) =>
      a.actionType === "publish_content" &&
      (a.context as { contentItemId?: string }).contentItemId === id,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/content"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Content
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
          <Badge variant="secondary">{item.status.replace(/_/g, " ")}</Badge>
        </div>
        {item.angle && (
          <p className="mt-1 text-sm text-muted-foreground">
            Angle: {item.angle}
          </p>
        )}
      </div>

      <ContentPublishControls
        id={item.id}
        status={item.status}
        publishPending={publishPending}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grounded in</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm">
            {sources.map((s) => (
              <li key={s.id}>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {SOURCE_LABEL[s.sourceType] ?? s.sourceType}
                </span>{" "}
                <span className="text-muted-foreground">{s.note}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Draft</CardTitle>
        </CardHeader>
        <CardContent>
          <ContentEditor
            id={item.id}
            title={item.title}
            body={item.body ?? ""}
            status={item.status}
          />
        </CardContent>
      </Card>

      <form action={deleteContentAction}>
        <input type="hidden" name="id" value={item.id} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="text-destructive"
        >
          Delete
        </Button>
      </form>
    </div>
  );
}
