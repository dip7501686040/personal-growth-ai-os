import type { ReactNode } from "react";
import { LearningTabs } from "@/components/learning/learning-tabs";

export default function LearningLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Learning</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Study sessions, DSA pattern-recognition practice, and the Learning
          Agent&apos;s daily plan.
        </p>
      </div>
      <LearningTabs />
      {children}
    </div>
  );
}
