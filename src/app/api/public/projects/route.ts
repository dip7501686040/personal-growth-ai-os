import { NextResponse } from "next/server";
import { getOwnerUserId } from "@/lib/owner";
import { getPublicProjects } from "@/modules/public/service";

export const revalidate = 300;

/** Unauthenticated. isPublic projects — the portfolio's project catalog,
 *  source of truth is this app's /projects page (Group P), not the
 *  portfolio repo. */
export async function GET() {
  const userId = await getOwnerUserId();
  const projects = await getPublicProjects(userId);
  return NextResponse.json(
    { projects },
    { headers: { "access-control-allow-origin": "*" } },
  );
}
