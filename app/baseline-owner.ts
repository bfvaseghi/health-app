import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { baselineOwner } from "../db/schema";

type Database = ReturnType<typeof getDb>;

/**
 * Baseline is deliberately single-user. The first durable record is the owner
 * record, so changing the hosting audience later cannot turn the D1 database
 * into a multi-user health service or let another signed-in visitor create a
 * second record beside it.
 */
export async function isBaselineOwner(db: Database, userId: string): Promise<boolean> {
  const [owner] = await db
    .select({ userId: baselineOwner.userId })
    .from(baselineOwner)
    .where(eq(baselineOwner.singleton, 1))
    .limit(1);
  if (owner) return owner.userId === userId;

  // A fresh/reset database fails closed unless deployment explicitly names the
  // owner by a one-way hash. The public shell can therefore never be claimed by
  // whichever signed-in visitor happens to arrive first.
  const configured = (env as unknown as Record<string, string | undefined>).BASELINE_OWNER_HASH;
  if (!configured) return false;
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId.trim().toLowerCase())))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (digest !== configured) return false;

  await db.insert(baselineOwner).values({ singleton: 1, userId, createdAt: new Date().toISOString() }).onConflictDoNothing();
  const [claimed] = await db
    .select({ userId: baselineOwner.userId })
    .from(baselineOwner)
    .where(eq(baselineOwner.singleton, 1))
    .limit(1);
  return claimed?.userId === userId;
}
