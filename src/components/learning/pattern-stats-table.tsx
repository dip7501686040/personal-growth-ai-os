import { cn } from "@/lib/utils";
import type { PatternStat } from "@/modules/learning/pattern-stats";

export function PatternStatsTable({ stats }: { stats: PatternStat[] }) {
  if (stats.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No attempts logged yet. Add a problem and log an attempt to build the
        pattern-recognition picture.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Pattern</th>
            <th className="py-2 pr-3 font-medium tabular-nums">Att.</th>
            <th className="py-2 pr-3 font-medium tabular-nums">Solve %</th>
            <th className="py-2 pr-3 font-medium tabular-nums">Avg hints</th>
            <th className="py-2 pr-3 font-medium tabular-nums">Can&apos;t ID</th>
            <th className="py-2 font-medium">Signal</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.slug} className="border-b last:border-0">
              <td className="py-2 pr-3 font-medium">{s.name}</td>
              <td className="py-2 pr-3 tabular-nums">{s.attempts}</td>
              <td className="py-2 pr-3 tabular-nums">
                {Math.round(s.solveRate * 100)}%
              </td>
              <td className="py-2 pr-3 tabular-nums">{s.avgHints}</td>
              <td className="py-2 pr-3 tabular-nums">{s.couldNotIdentify}</td>
              <td className="py-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    s.recognitionGap
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      : s.solveRate >= 0.7
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.recognitionGap
                    ? "recognition gap"
                    : s.solveRate >= 0.7
                      ? "solid"
                      : "practising"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
