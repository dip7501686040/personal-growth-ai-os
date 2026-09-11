import { NextResponse } from "next/server";
import { getOwnerUserId } from "@/lib/owner";
import { getPublicContentCards } from "@/modules/public/service";

export const revalidate = 300;

/** Unauthenticated. Curated portfolio deep-dive cards (Group C) — the
 *  portfolio's real source of truth for /projects/[slug]'s content grid. */
export async function GET() {
  const userId = await getOwnerUserId();
  const cards = await getPublicContentCards(userId);
  return NextResponse.json(
    { cards },
    { headers: { "access-control-allow-origin": "*" } },
  );
}
