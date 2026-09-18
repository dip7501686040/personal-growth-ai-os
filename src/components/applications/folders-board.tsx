"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Pager } from "@/components/ui/pager";
import { usePaginated } from "@/hooks/use-paginated";
import { STATUS_VARIANT } from "@/components/applications/selection-board";

export interface FolderSection {
  date: string;
  folders: { name: string; status: string | null }[];
}

const PAGE_SIZE = 5;

export function FoldersBoard({ sections }: { sections: FolderSection[] }) {
  const { page, pageCount, pageItems, setPage } = usePaginated(sections, PAGE_SIZE);

  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">No folders yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {pageItems.map(({ date, folders }) => (
        <div key={date} className="flex flex-col gap-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground">
            {date} · {folders.length}
          </h4>
          <div className="divide-y rounded-lg border">
            {folders.map((f) => (
              <Link
                key={f.name}
                href={`/applications/${date}/${f.name}`}
                className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-accent/50"
              >
                <span className="truncate">{f.name}</span>
                {f.status && (
                  <Badge
                    variant={STATUS_VARIANT[f.status] ?? "outline"}
                    className="ml-auto"
                  >
                    {f.status}
                  </Badge>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
      <Pager page={page} pageCount={pageCount} onChange={setPage} />
    </div>
  );
}
