"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TARGET_TYPE_LABEL } from "@/modules/knowledge/target-types";
import type { ModuleFacet, SkillFacet } from "@/lib/knowledge";

const MODULE_TYPES = [
  "project",
  "career_opportunity",
  "content_item",
  "business_opportunity",
  "learning_session",
  "dsa_pattern",
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  language: "Languages",
  framework: "Frameworks",
  database: "Databases",
  infrastructure: "Infrastructure",
  concept: "Concepts",
  tool: "Tools",
  practice: "Practices",
  dsa_pattern: "DSA patterns",
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function DocumentFilters({
  skillFacets,
  moduleFacets,
}: {
  skillFacets: SkillFacet[];
  moduleFacets: ModuleFacet[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeQ = searchParams.get("q") ?? "";
  const activeSkills = useMemo(
    () => (searchParams.get("skill")?.split(",").filter(Boolean) ?? []),
    [searchParams],
  );
  const activeTypes = useMemo(
    () => (searchParams.get("type")?.split(",").filter(Boolean) ?? []),
    [searchParams],
  );

  const [query, setQuery] = useState(activeQ);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  function push(next: { q?: string; skill?: string[]; type?: string[] }) {
    const params = new URLSearchParams(searchParams.toString());
    const q = next.q ?? activeQ;
    const skill = next.skill ?? activeSkills;
    const type = next.type ?? activeTypes;
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    if (skill.length) params.set("skill", skill.join(","));
    else params.delete("skill");
    if (type.length) params.set("type", type.join(","));
    else params.delete("type");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}#documents`, { scroll: false });
  }

  // debounce the search box
  useEffect(() => {
    if (query === activeQ) return;
    const t = setTimeout(() => push({ q: query }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-arm on query changes
  }, [query]);

  const byCategory = useMemo(() => {
    const map = new Map<string, SkillFacet[]>();
    for (const s of skillFacets) {
      const arr = map.get(s.category) ?? [];
      arr.push(s);
      map.set(s.category, arr);
    }
    return [...map.entries()];
  }, [skillFacets]);

  const moduleCount = new Map(moduleFacets.map((m) => [m.targetType, m.count]));
  const hasActive = activeQ || activeSkills.length > 0 || activeTypes.length > 0;

  function toggleCategory(category: string, ids: string[]) {
    const allOn = ids.every((id) => activeSkills.includes(id));
    push({ skill: allOn ? activeSkills.filter((id) => !ids.includes(id)) : [...new Set([...activeSkills, ...ids])] });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, linked skill/project, tag…"
          className="max-w-sm"
        />
        {hasActive && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery("");
              router.replace(`${pathname}#documents`, { scroll: false });
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {moduleFacets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Modules:</span>
          {MODULE_TYPES.filter((t) => moduleCount.has(t)).map((t) => {
            const on = activeTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => push({ type: toggle(activeTypes, t) })}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  on
                    ? "border-primary/30 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {TARGET_TYPE_LABEL[t]} · {moduleCount.get(t)}
              </button>
            );
          })}
        </div>
      )}

      {byCategory.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Skills:</span>
          <div className="flex flex-col gap-1.5">
            {byCategory.map(([category, list]) => {
              const ids = list.map((s) => s.skillId);
              const open = openCategories.has(category);
              const allOn = ids.every((id) => activeSkills.includes(id));
              const someOn = ids.some((id) => activeSkills.includes(id));
              return (
                <div key={category} className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenCategories((prev) => {
                        const next = new Set(prev);
                        if (next.has(category)) next.delete(category);
                        else next.add(category);
                        return next;
                      })
                    }
                    className="w-36 shrink-0 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {open ? "▾" : "▸"} {CATEGORY_LABEL[category] ?? category}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category, ids)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px]",
                      someOn
                        ? "border-primary/30 bg-primary/10"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {allOn ? "clear all" : "select all"}
                  </button>
                  {open && (
                    <div className="flex flex-1 flex-wrap gap-1.5 basis-full pl-[9.5rem]">
                      {list.map((s) => {
                        const on = activeSkills.includes(s.skillId);
                        return (
                          <button
                            key={s.skillId}
                            type="button"
                            onClick={() => push({ skill: toggle(activeSkills, s.skillId) })}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs transition-colors",
                              on
                                ? "border-primary/30 bg-primary/10 text-foreground"
                                : "border-border text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {s.name} · {s.count}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
