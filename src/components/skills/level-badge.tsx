import { cn } from "@/lib/utils";
import { LEVEL_BADGE_CLASS, LEVEL_LABEL, type SkillLevel } from "@/modules/skills/levels";

export function LevelBadge({
  level,
  className,
}: {
  level: SkillLevel;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        LEVEL_BADGE_CLASS[level],
        className,
      )}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}
