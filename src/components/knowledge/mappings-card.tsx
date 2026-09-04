"use client";

import { useActionState, useMemo, useState } from "react";
import { useActionToast } from "@/components/use-action-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { TARGET_TYPE_LABEL, type KnowledgeTargetType } from "@/modules/knowledge/target-types";
import {
  addManualLinkAction,
  decideLinkAction,
  removeLinkAction,
  toggleTagAction,
  type ActionState,
} from "@/app/(app)/knowledge/actions";
import type {
  DocumentLinkRow,
  DocumentTagRow,
  LinkTargetOption,
  TaxonomyOption,
} from "@/modules/knowledge/mapping";

const STATUS_CLASS: Record<DocumentLinkRow["status"], string> = {
  suggested: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  accepted:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-muted text-muted-foreground line-through",
};

const METHOD_LABEL: Record<string, string> = {
  embedding: "semantic",
  skill_name: "name match",
  shared_source: "same source",
  shared_source_repo_name: "repo name",
  manual: "manual",
};

function TagChips({
  documentId,
  applied,
  options,
}: {
  documentId: string;
  applied: DocumentTagRow[];
  options: TaxonomyOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    toggleTagAction,
    null,
  );
  useActionToast(state);
  const appliedBySlug = new Map(applied.map((t) => [t.tagSlug, t]));

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = appliedBySlug.get(o.slug);
        return (
          <form key={o.slug} action={formAction}>
            <input type="hidden" name="documentId" value={documentId} />
            <input type="hidden" name="tagSlug" value={o.slug} />
            <input type="hidden" name="add" value={on ? "false" : "true"} />
            <button
              type="submit"
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                on
                  ? "border-primary/30 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
              title={on ? `${Math.round(on.confidence * 100)}% confidence` : "Add tag"}
            >
              {o.label}
            </button>
          </form>
        );
      })}
    </div>
  );
}

function LinkActions({
  link,
  documentId,
}: {
  link: DocumentLinkRow;
  documentId: string;
}) {
  const [decideState, decideAction, deciding] = useActionState<
    ActionState,
    FormData
  >(decideLinkAction, null);
  const [removeState, removeAction, removing] = useActionState<
    ActionState,
    FormData
  >(removeLinkAction, null);
  useActionToast(decideState);
  useActionToast(removeState);

  const pending = deciding || removing;

  return (
    <div className="flex shrink-0 gap-1.5">
      {link.status === "suggested" && (
        <form action={decideAction} className="flex gap-1.5">
          <input type="hidden" name="linkId" value={link.id} />
          <input type="hidden" name="documentId" value={documentId} />
          <Button
            type="submit"
            name="decision"
            value="accepted"
            size="sm"
            variant="outline"
            disabled={pending}
          >
            Accept
          </Button>
          <Button
            type="submit"
            name="decision"
            value="rejected"
            size="sm"
            variant="ghost"
            disabled={pending}
          >
            Reject
          </Button>
        </form>
      )}
      <form action={removeAction}>
        <input type="hidden" name="linkId" value={link.id} />
        <input type="hidden" name="documentId" value={documentId} />
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={pending}
        >
          Remove
        </Button>
      </form>
    </div>
  );
}

function LinkRow({ link, documentId }: { link: DocumentLinkRow; documentId: string }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("rounded-full px-2 py-0.5 font-medium", STATUS_CLASS[link.status])}>
          {link.status}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
          {TARGET_TYPE_LABEL[link.targetType]}
        </span>
        <span className="font-medium">{link.targetLabel}</span>
        <span className="text-muted-foreground">{link.relation}</span>
        <span className="ml-auto tabular-nums text-muted-foreground">
          {link.score.toFixed(2)}
        </span>
      </div>
      {link.rationale && (
        <p className="text-xs text-muted-foreground">{link.rationale}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {link.method.map((m) => (
          <span key={m} className="rounded bg-muted px-1.5 py-0.5">
            {METHOD_LABEL[m] ?? m}
          </span>
        ))}
        <span className="ml-auto">{link.createdBy === "user" ? "you" : "agent"}</span>
      </div>
      <LinkActions link={link} documentId={documentId} />
    </li>
  );
}

function AddMapping({
  documentId,
  allTargets,
  existingKeys,
}: {
  documentId: string;
  allTargets: LinkTargetOption[];
  existingKeys: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<KnowledgeTargetType | "">("");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addManualLinkAction,
    null,
  );
  useActionToast(state);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return allTargets
      .filter((t) => !existingKeys.has(`${t.targetType}:${t.targetId}`))
      .filter((t) => !type || t.targetType === type)
      .filter((t) => t.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, type, allTargets, existingKeys]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills, projects, learning sessions…"
          className="text-sm"
        />
        <NativeSelect
          value={type}
          onChange={(e) => setType(e.target.value as KnowledgeTargetType | "")}
          className="w-40 shrink-0"
        >
          <option value="">Any type</option>
          {Object.entries(TARGET_TYPE_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {matches.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border text-sm">
          {matches.map((m) => (
            <li
              key={`${m.targetType}:${m.targetId}`}
              className="flex items-center gap-2 px-2.5 py-1.5"
            >
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {TARGET_TYPE_LABEL[m.targetType]}
              </span>
              <span className="truncate">{m.label}</span>
              <form action={formAction} className="ml-auto">
                <input type="hidden" name="documentId" value={documentId} />
                <input type="hidden" name="targetType" value={m.targetType} />
                <input type="hidden" name="targetId" value={m.targetId} />
                <Button type="submit" size="sm" variant="secondary" disabled={pending}>
                  Add
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && matches.length === 0 && (
        <p className="text-xs text-muted-foreground">No matches.</p>
      )}
    </div>
  );
}

export function MappingsCard({
  documentId,
  links,
  tags,
  taxonomyOptions,
  allTargets,
}: {
  documentId: string;
  links: DocumentLinkRow[];
  tags: DocumentTagRow[];
  taxonomyOptions: TaxonomyOption[];
  allTargets: LinkTargetOption[];
}) {
  const existingKeys = new Set(links.map((l) => `${l.targetType}:${l.targetId}`));
  const ordered = [...links].sort((a, b) => {
    const rank = { accepted: 0, suggested: 1, rejected: 2 };
    return rank[a.status] - rank[b.status] || b.score - a.score;
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">Subject tags</h4>
        <TagChips documentId={documentId} applied={tags} options={taxonomyOptions} />
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">
          Mapped to ({links.length})
        </h4>
        {ordered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No mappings yet — the nightly mapper hasn&apos;t run on this document,
            or nothing cleared the bar. Add one below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ordered.map((l) => (
              <LinkRow key={l.id} link={l} documentId={documentId} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">Add mapping</h4>
        <AddMapping
          documentId={documentId}
          allTargets={allTargets}
          existingKeys={existingKeys}
        />
      </div>
    </div>
  );
}
