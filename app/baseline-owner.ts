import { asc } from "drizzle-orm";
import { getDb } from "../db";
import { healthStates } from "../db/schema";

type Database = ReturnType<typeof getDb>;

/**
 * Baseline is deliberately single-user. The first durable record is the owner
 * record, so changing the hosting audience later cannot turn the D1 database
 * into a multi-user health service or let another signed-in visitor create a
 * second record beside it.
 */
export async function isBaselineOwner(db: Database, userId: string): Promise<boolean> {
  const [owner] = await db
    .select({ userId: healthStates.userId })
    .from(healthStates)
    .orderBy(asc(healthStates.updatedAt))
    .limit(1);
  return !owner || owner.userId === userId;
}
