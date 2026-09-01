import { requireUser } from "@/lib/auth";

/** The authenticated user's id, or a redirect to /login. Server-only. */
export async function requireUserId(): Promise<string> {
  const user = await requireUser();
  return user.id;
}
