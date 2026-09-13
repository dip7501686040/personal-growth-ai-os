import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isDemoUserId } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { resetDemoData } from "@/modules/demo/reset";

export async function POST(request: Request) {
  const { origin } = new URL(request.url);

  // Capture identity before signing out — the session (and with it,
  // getCurrentUser()) is gone right after.
  const user = await getCurrentUser();
  const supabase = await createClient();
  await supabase.auth.signOut();

  if (user && (await isDemoUserId(user.id))) {
    // Best-effort — a slow reset shouldn't hold up the redirect. The daily
    // cron is the fallback if this ever fails.
    void resetDemoData(user.id).catch((e) => {
      console.error("demo reset on logout failed:", e);
    });
  }

  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
