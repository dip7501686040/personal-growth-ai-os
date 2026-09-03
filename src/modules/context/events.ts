import { db } from "@/lib/db";
import { contextEvents } from "@/lib/db/schema";

export type ContextEventKind =
  | "learning_logged"
  | "skill_changed"
  | "project_updated"
  | "activity_analyzed";

/**
 * Append an outbox row. A domain write calls this whenever it changes
 * something the knowledge base should reflect; the `knowledge-refresh` cron
 * drains the outbox and (re-)builds the affected knowledge document.
 *
 * Best-effort: a failure here never breaks the originating write.
 */
export async function recordContextEvent(input: {
  userId: string;
  kind: ContextEventKind;
  refId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(contextEvents).values({
      userId: input.userId,
      kind: input.kind,
      refId: input.refId ?? null,
      payload: (input.payload ?? {}) as object,
    });
  } catch {
    // outbox is advisory — swallow
  }
}
