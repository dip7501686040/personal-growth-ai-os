import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/user";
import { listApplications } from "@/modules/applications/service";
import {
  folderName,
  listFolderFiles,
  readFolderFile,
} from "@/modules/applications/generate";
import { FolderEditor } from "@/components/applications/folder-editor";

const TEXT = /\.(md|txt|json|html)$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ folder: string }>;
}) {
  const { folder } = await params;
  return { title: `${folder} · Applications` };
}

export default async function ApplicationFolderPage({
  params,
}: {
  params: Promise<{ date: string; folder: string }>;
}) {
  const { date, folder } = await params;
  const userId = await requireUserId();

  const names = await listFolderFiles(date, folder);
  if (names.length === 0) notFound();

  const files = await Promise.all(
    [...names].sort().map(async (name) => ({
      name,
      text: TEXT.test(name) ? await readFolderFile(date, folder, name) : null,
    })),
  );

  const apps = await listApplications(userId);
  const match = apps.find(
    (a) => folderName({ company: a.company, role: a.role }) === folder,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link
          href="/applications"
          className="text-xs text-muted-foreground underline"
        >
          ← Applications
        </Link>
        <h2 className="text-lg font-semibold">
          {match ? `${match.company} — ${match.role}` : folder}
        </h2>
        <p className="text-sm text-muted-foreground">
          {date} · {names.length} files · source of truth: R2
        </p>
      </div>

      <FolderEditor
        date={date}
        folder={folder}
        files={files}
        ledgerStatus={match?.status ?? null}
      />
    </div>
  );
}
