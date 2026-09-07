import { NextResponse } from "next/server";
import { getOwnerUserId } from "@/lib/owner";
import { getPublicContent } from "@/modules/public/service";

export const revalidate = 300;

/** Unauthenticated. Returns only content items the owner marked
 *  `isPublic && published` — for the portfolio site (J6). */
export async function GET() {
  const userId = await getOwnerUserId();
  const items = await getPublicContent(userId);
  return NextResponse.json(
    { items },
    { headers: { "access-control-allow-origin": "*" } },
  );
}
