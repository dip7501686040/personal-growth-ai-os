import { NextResponse } from "next/server";
import { getOwnerUserId } from "@/lib/owner";
import { getPublicFeatures } from "@/modules/public/service";

export const revalidate = 300;

/** Unauthenticated. `done` features of projects the owner flagged `isPublic`. */
export async function GET() {
  const userId = await getOwnerUserId();
  const features = await getPublicFeatures(userId);
  return NextResponse.json(
    { features },
    { headers: { "access-control-allow-origin": "*" } },
  );
}
