import { and, eq, sql } from "drizzle-orm";
import type { getDb } from "./index";
import { healthStateBackups, healthStates } from "./schema";

/** Match every destination column in order; null lets SQLite allocate the ID. */
export function stateBackupQuery(db: ReturnType<typeof getDb>, userId: string, revision: number, now: string) {
  return db.insert(healthStateBackups).select(
    db.select({
      id: sql<number>`null`.as("id"),
      userId: healthStates.userId,
      payload: healthStates.payload,
      createdAt: sql<string>`${now}`.as("created_at"),
      replacedRevision: healthStates.revision,
    }).from(healthStates).where(and(eq(healthStates.userId, userId), eq(healthStates.revision, revision))),
  );
}
