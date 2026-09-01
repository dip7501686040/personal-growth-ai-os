import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-svh bg-background">
      <AppNav email={user.email ?? ""} />
      <main className="flex-1 overflow-x-hidden px-8 py-8">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
