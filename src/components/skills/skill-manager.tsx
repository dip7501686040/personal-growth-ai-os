"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronRightIcon, GripVerticalIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { LevelBadge } from "@/components/skills/level-badge";
import { MergeDialog, type MergeIntent } from "@/components/skills/merge-dialog";
import { ExcludeToggle } from "@/components/shared/exclude-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CATEGORY_LABEL, SKILL_CATEGORIES } from "@/modules/skills/levels";
import type { SkillWithCounts } from "@/modules/skills/service";
import {
  createChildSkillAction,
  setSkillCategoryAction,
  setSkillExcludedAction,
  setSkillParentAction,
  updateSkillLabelAction,
  type ActionState,
} from "@/app/(app)/skills/actions";
import type { SkillCategory } from "@/modules/skills/levels";
import { cn } from "@/lib/utils";

type Node = SkillWithCounts & { children: SkillWithCounts[] };
type CategoryGroup = { category: string; roots: Node[] };

export function SkillManager({
  groups,
  rootChoices,
}: {
  groups: CategoryGroup[];
  /** every top-level skill — for the "merge into" / "nest under" selects */
  rootChoices: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [merge, setMerge] = useState<MergeIntent | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const busy = isPending || refreshing;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups)
      for (const r of g.roots) {
        m.set(r.id, r.label ?? r.name);
        for (const c of r.children) m.set(c.id, c.label ?? c.name);
      }
    return m;
  }, [groups]);

  const categoryById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups)
      for (const r of g.roots) {
        m.set(r.id, r.category);
        for (const c of r.children) m.set(c.id, c.category);
      }
    return m;
  }, [groups]);

  const toggleExpand = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** Run a skills server action, toast the result, then refresh the server tree.
   *  `busy` stays true for the whole thing (action + resync + RSC refetch). */
  const run = useCallback(
    (p: Promise<ActionState>, okFallback = "Done.") =>
      startTransition(async () => {
        let ok = false;
        try {
          const res = await p;
          if (res && !res.ok) {
            toast.error(res.message);
          } else {
            toast.success(res?.message ?? okFallback);
            ok = true;
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Something went wrong.");
        }
        if (ok) startRefresh(() => router.refresh());
      }),
    [router],
  );

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const activeId = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    if (over.startsWith("parent:")) {
      const parentId = over.slice(7);
      if (parentId === activeId) return;
      run(setSkillParentAction({ skillId: activeId, parentId }));
    } else if (over.startsWith("cat:")) {
      const category = over.slice(4) as SkillCategory;
      if (categoryById.get(activeId) === category) return;
      run(setSkillCategoryAction({ skillId: activeId, category }), "Category updated.");
    } else if (over.startsWith("row:")) {
      const targetId = over.slice(4);
      if (targetId === activeId) return;
      setMerge({ targetId, targetLabel: labelById.get(targetId) ?? "skill", sourceIds: [activeId] });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e) => setDragging(String(e.active.id))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-center justify-end gap-3">
        {busy && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            Saving…
          </span>
        )}
        <Button
          size="sm"
          variant={edit ? "default" : "outline"}
          disabled={busy}
          onClick={() => setEdit((v) => !v)}
        >
          {edit ? "Done editing" : "Edit layout"}
        </Button>
      </div>

      <div
        aria-busy={busy}
        className={cn(
          "relative mt-4 flex flex-col gap-8 transition-opacity",
          busy && "pointer-events-none opacity-60",
        )}
      >
        {busy && (
          <div className="absolute inset-x-0 -top-2 h-0.5 animate-pulse rounded bg-primary/60" />
        )}
        {groups.map((g) => (
          <section key={g.category} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {CATEGORY_LABEL[g.category as keyof typeof CATEGORY_LABEL] ?? g.category}
            </h2>
            {dragging && categoryById.get(dragging) !== g.category && (
              <CategoryDropStrip category={g.category} />
            )}
            <div className="divide-y rounded-lg border">
              {g.roots.map((r) => (
                <SkillRow
                  key={r.id}
                  node={r}
                  edit={edit}
                  expanded={expanded.has(r.id)}
                  onToggle={() => toggleExpand(r.id)}
                  rootChoices={rootChoices}
                  onMerge={(targetId) =>
                    setMerge({
                      targetId,
                      targetLabel: labelById.get(targetId) ?? "skill",
                      sourceIds: [r.id],
                    })
                  }
                  run={run}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <DragOverlay>
        {dragging ? (
          <div className="rounded-md border bg-card px-3 py-1.5 text-sm font-medium shadow-lg">
            {labelById.get(dragging) ?? "skill"}
          </div>
        ) : null}
      </DragOverlay>

      <MergeDialog
        key={merge ? `${merge.targetId}:${merge.sourceIds.join(",")}` : "none"}
        intent={merge}
        onClose={() => setMerge(null)}
        onDone={() => {
          setMerge(null);
          startRefresh(() => router.refresh());
        }}
      />
    </DndContext>
  );
}

// ── category drop band (shows only while dragging, above a category's rows) ──

function CategoryDropStrip({ category }: { category: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cat:${category}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md border border-dashed px-3 py-1.5 text-xs transition-colors",
        isOver
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground",
      )}
    >
      Drop here → move to{" "}
      {CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL] ?? category}
    </div>
  );
}

// ── one skill (root or child) ─────────────────────────────────────────────

function SkillRow({
  node,
  edit,
  expanded,
  onToggle,
  rootChoices,
  onMerge,
  run,
  isChild = false,
}: {
  node: Node | SkillWithCounts;
  edit: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  rootChoices: { id: string; label: string }[];
  onMerge: (targetId: string) => void;
  run: (p: Promise<ActionState>, okFallback?: string) => void;
  isChild?: boolean;
}) {
  const children = "children" in node ? node.children : [];
  const hasChildren = children.length > 0;

  const {
    setNodeRef: setDragRef,
    listeners: dragListeners,
    attributes: dragAttributes,
    transform: dragTransform,
  } = useDraggable({ id: node.id, disabled: !edit });
  const { setNodeRef: setRowDropRef, isOver: rowIsOver } = useDroppable({
    id: `row:${node.id}`,
  });

  const style = dragTransform
    ? {
        transform: `translate3d(${dragTransform.x}px, ${dragTransform.y}px, 0)`,
        opacity: 0.5,
      }
    : undefined;

  const setRowRef = (el: HTMLDivElement | null) => {
    setDragRef(el);
    setRowDropRef(el);
  };

  return (
    <div>
      <div
        ref={setRowRef}
        style={style}
        className={cn(
          "flex flex-wrap items-start gap-x-2 gap-y-2 px-3 py-3",
          "sm:flex-nowrap sm:items-center sm:gap-x-3 sm:px-4",
          isChild && "pl-8 sm:pl-10",
          node.excludedAt && "bg-muted/30",
          rowIsOver && edit && "bg-primary/10 ring-1 ring-primary/40",
        )}
      >
        {edit && (
          <button
            type="button"
            className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing sm:mt-0"
            {...dragListeners}
            {...dragAttributes}
            aria-label="Drag to merge or re-nest"
          >
            <GripVerticalIcon className="size-4" />
          </button>
        )}

        {!isChild && (
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "mt-0.5 shrink-0 text-muted-foreground transition-transform sm:mt-0",
              expanded && "rotate-90",
              !hasChildren && !edit && "invisible",
            )}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <ChevronRightIcon className="size-4" />
          </button>
        )}

        <div className="min-w-0 flex-1 basis-40">
          {edit ? (
            <LabelEditor node={node} run={run} />
          ) : (
            <Link href={`/skills/${node.slug}`} className="group block">
              <span
                className={cn(
                  "text-sm font-medium group-hover:underline",
                  node.excludedAt && "text-muted-foreground line-through",
                )}
              >
                {node.label ?? node.name}
              </span>
              {node.label && node.label !== node.name && (
                <span className="ml-1.5 text-xs text-muted-foreground">({node.name})</span>
              )}
            </Link>
          )}
          <p className="text-xs text-muted-foreground">
            {isChild ? "child · " : ""}
            {hasChildren ? `${children.length} child${children.length === 1 ? "" : "ren"} · ` : ""}
            {node.acceptedCount} accepted
            {node.suggestedCount > 0 ? ` · ${node.suggestedCount} to review` : ""}
            {" · "}confidence {node.confidence}
          </p>
        </div>

        <div className="mt-0.5 flex shrink-0 items-center gap-2 sm:mt-0">
          <ExcludeToggle
            compact
            excluded={!!node.excludedAt}
            action={setSkillExcludedAction}
            actionArgs={{ skillId: node.id }}
          />
          <LevelBadge level={node.level} />
        </div>

        {edit && (
          <div className="order-last w-full sm:order-none sm:w-auto">
            <RowEditControls
              node={node}
              isChild={isChild}
              rootChoices={rootChoices}
              onMerge={onMerge}
              run={run}
            />
          </div>
        )}
      </div>

      {!isChild && expanded && (
        <ChildZone
          parentId={node.id}
          items={children}
          edit={edit}
          rootChoices={rootChoices}
          onMerge={onMerge}
          run={run}
        />
      )}
    </div>
  );
}

// ── child list + drop zone under an expanded root ─────────────────────────

function ChildZone({
  parentId,
  items,
  edit,
  rootChoices,
  onMerge,
  run,
}: {
  parentId: string;
  items: SkillWithCounts[];
  edit: boolean;
  rootChoices: { id: string; label: string }[];
  onMerge: (t: string) => void;
  run: (p: Promise<ActionState>, okFallback?: string) => void;
}) {
  const { setNodeRef: setZoneRef, isOver: zoneIsOver } = useDroppable({
    id: `parent:${parentId}`,
  });

  return (
    <div className="border-t bg-muted/20">
      {items.map((c) => (
        <SkillRow
          key={c.id}
          node={c}
          edit={edit}
          rootChoices={rootChoices}
          onMerge={onMerge}
          run={run}
          isChild
        />
      ))}

      {edit && (
        <div
          ref={setZoneRef}
          className={cn(
            "m-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground",
            zoneIsOver && "border-primary bg-primary/10 text-foreground",
          )}
        >
          Drop a skill here to nest it under this one, or
          <AddChildInline parentId={parentId} run={run} />
        </div>
      )}
      {!edit && items.length === 0 && (
        <p className="px-10 py-3 text-xs text-muted-foreground">No child skills.</p>
      )}
    </div>
  );
}

function AddChildInline({
  parentId,
  run,
}: {
  parentId: string;
  run: (p: Promise<ActionState>, okFallback?: string) => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={(fd) => {
        run(createChildSkillAction(null, fd), "Child skill added.");
        ref.current?.reset();
      }}
      className="mt-2 flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="parentId" value={parentId} />
      <Input
        name="name"
        placeholder="new child skill"
        required
        className="h-8 min-w-0 flex-1 text-xs sm:h-7 sm:w-44 sm:flex-none"
      />
      <NativeSelect
        name="category"
        defaultValue="tool"
        className="h-8 min-w-0 flex-1 text-xs sm:h-7 sm:w-32 sm:flex-none"
      >
        {SKILL_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" size="sm" variant="outline" className="h-8 sm:h-7">
        Add
      </Button>
    </form>
  );
}

// ── inline label editor ──────────────────────────────────────────────────

function LabelEditor({
  node,
  run,
}: {
  node: SkillWithCounts;
  run: (p: Promise<ActionState>, okFallback?: string) => void;
}) {
  const [val, setVal] = useState(node.label ?? "");
  const commit = () => {
    const next = val.trim();
    if (next === (node.label ?? "")) return;
    run(
      updateSkillLabelAction({ skillId: node.id, label: next || null }),
      "Label updated.",
    );
  };
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setVal(node.label ?? "");
        }}
        placeholder={node.name}
        className="h-8 w-full min-w-0 max-w-[220px] text-sm"
      />
      <span className="truncate text-xs text-muted-foreground">({node.name})</span>
    </div>
  );
}

// ── per-row edit controls (merge into / nest under / unnest) ──────────────

function RowEditControls({
  node,
  isChild,
  rootChoices,
  onMerge,
  run,
}: {
  node: Node | SkillWithCounts;
  isChild: boolean;
  rootChoices: { id: string; label: string }[];
  onMerge: (targetId: string) => void;
  run: (p: Promise<ActionState>, okFallback?: string) => void;
}) {
  const childCount = "children" in node ? node.children.length : node.childCount;
  const others = rootChoices.filter((c) => c.id !== node.id);

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
      <NativeSelect
        aria-label="Merge into"
        value=""
        onChange={(e) => e.target.value && onMerge(e.target.value)}
        className="h-8 min-w-0 flex-1 text-xs sm:h-7 sm:w-28 sm:flex-none"
      >
        <option value="">Merge into…</option>
        {others.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </NativeSelect>

      {isChild ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 flex-1 text-xs sm:h-7 sm:flex-none"
          onClick={() => run(setSkillParentAction({ skillId: node.id, parentId: null }), "Moved to top level.")}
        >
          Unnest
        </Button>
      ) : childCount === 0 ? (
        <NativeSelect
          aria-label="Nest under"
          value=""
          onChange={(e) =>
            e.target.value &&
            run(setSkillParentAction({ skillId: node.id, parentId: e.target.value }), "Nested.")
          }
          className="h-8 min-w-0 flex-1 text-xs sm:h-7 sm:w-28 sm:flex-none"
        >
          <option value="">Nest under…</option>
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      ) : null}
    </div>
  );
}
