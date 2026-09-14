import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { isDemoUserId } from "@/lib/demo";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const isDemo = await isDemoUserId(user.id);

  return (
    <div className="flex min-h-svh flex-col bg-background md:flex-row">
      <AppNav email={user.email ?? ""} isDemo={isDemo} />
      <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-5xl">
          {isDemo && (
            <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              You&apos;re in the demo account — everything here is sample
              data. Read and write freely; it resets automatically once a
              day (or immediately on sign-out) and never touches the real
              account.
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
