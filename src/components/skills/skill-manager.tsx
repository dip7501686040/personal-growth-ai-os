"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronRightIcon, GripVerticalIcon } from "lucide-react";
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
  setSkillExcludedAction,
  setSkillParentAction,
  updateSkillLabelAction,
  type ActionState,
} from "@/app/(app)/skills/actions";
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
  const [, startTransition] = useTransition();

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

  const toggleExpand = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const run = useCallback(
    (p: Promise<ActionState>, okFallback = "Done.") =>
      startTransition(async () => {
        const res = await p;
        if (res && !res.ok) toast.error(res.message);
        else toast.success(res?.message ?? okFallback);
        router.refresh();
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
    } else if (over.startsWith("row:")) {
      const targetId = over.slice(4);
      if (targetId === activeId) return;
      setMerge({ targetId, targetLabel: labelById.get(targetId) ?? "skill", sourceIds: [activeId] });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setDragging(String(e.active.id))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          variant={edit ? "default" : "outline"}
          onClick={() => setEdit((v) => !v)}
        >
          {edit ? "Done editing" : "Edit layout"}
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-8">
        {groups.map((g) => (
          <section key={g.category} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {CATEGORY_LABEL[g.category as keyof typeof CATEGORY_LABEL] ?? g.category}
            </h2>
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
          router.refresh();
        }}
      />
    </DndContext>
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
          "flex items-center gap-3 px-4 py-3",
          isChild && "pl-10",
          node.excludedAt && "bg-muted/30",
          rowIsOver && edit && "bg-primary/10 ring-1 ring-primary/40",
        )}
      >
        {edit && (
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
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
              "text-muted-foreground transition-transform",
              expanded && "rotate-90",
              !hasChildren && !edit && "invisible",
            )}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <ChevronRightIcon className="size-4" />
          </button>
        )}

        <div className="min-w-0 flex-1">
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

        {edit && (
          <RowEditControls node={node} isChild={isChild} rootChoices={rootChoices} onMerge={onMerge} run={run} />
        )}

        <ExcludeToggle
          excluded={!!node.excludedAt}
          action={setSkillExcludedAction}
          actionArgs={{ skillId: node.id }}
        />
        <LevelBadge level={node.level} />
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
      <Input name="name" placeholder="new child skill" required className="h-7 w-44 text-xs" />
      <NativeSelect name="category" defaultValue="tool" className="h-7 w-32 text-xs">
        {SKILL_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" size="sm" variant="outline" className="h-7">
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
    <div className="flex items-center gap-1.5">
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setVal(node.label ?? "");
        }}
        placeholder={node.name}
        className="h-7 max-w-[220px] text-sm"
      />
      <span className="shrink-0 text-xs text-muted-foreground">({node.name})</span>
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
    <div className="flex shrink-0 items-center gap-1.5">
      <NativeSelect
        aria-label="Merge into"
        value=""
        onChange={(e) => e.target.value && onMerge(e.target.value)}
        className="h-7 w-28 text-xs"
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
          className="h-7 text-xs"
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
          className="h-7 w-28 text-xs"
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
