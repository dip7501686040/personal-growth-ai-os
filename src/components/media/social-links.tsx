"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export interface LinkGroup {
  label: string;
  links: { label: string; url: string }[];
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied.");
  } catch {
    toast.error("Could not copy — select and copy by hand.");
  }
}

export function SocialLinks({ groups }: { groups: LinkGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">(no links.json found)</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">{g.label}</h4>
          <div className="divide-y rounded-lg border">
            {g.links.map((l) => (
              <div
                key={l.url}
                className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
              >
                <span className="w-40 shrink-0 font-medium">{l.label}</span>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate text-primary underline underline-offset-2"
                >
                  {l.url}
                </a>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copy(l.url)}
                >
                  Copy
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
