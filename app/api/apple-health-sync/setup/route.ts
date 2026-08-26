import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appleHealthSyncs } from "../../../../db/schema";
import {
  emptyAppleHealthSyncPayload,
  generateAppleHealthSyncToken,
  hashAppleHealthSyncToken,
} from "../../../apple-health-sync";
import { isBaselineOwner } from "../../../baseline-owner";
import { getChatGPTUser } from "../../../chatgpt-auth";

const NO_STORE = { "Cache-Control": "no-store" };

async function authenticatedUserId(): Promise<string | null> {
  const user = await getChatGPTUser();
  return user?.email.toLowerCase() ?? null;
}

function storageError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return Response.json({ error: "Apple Health sync is still being prepared." }, { status: 503, headers: NO_STORE });
  }
  return Response.json({ error: "Apple Health sync is temporarily unavailable." }, { status: 500, headers: NO_STORE });
}

/** Returns status only. The bearer token can never be read back. */
export async function GET() {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in with ChatGPT." }, { status: 401, headers: NO_STORE });

  try {
    const db = getDb();
    if (!(await isBaselineOwner(db, userId))) {
      return Response.json({ error: "This is a private record." }, { status: 403, headers: NO_STORE });
    }
    const [row] = await db
      .select({ lastSyncedAt: appleHealthSyncs.lastSyncedAt })
      .from(appleHealthSyncs)
      .where(eq(appleHealthSyncs.userId, userId))
      .limit(1);

    return Response.json(
      { configured: Boolean(row), lastSyncedAt: row?.lastSyncedAt ?? null },
      { headers: NO_STORE },
    );
  } catch (error) {
    return storageError(error);
  }
}

/** Creates or rotates the owner's bearer token and returns its raw value once. */
export async function POST() {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in with ChatGPT." }, { status: 401, headers: NO_STORE });

  try {
    const db = getDb();
    if (!(await isBaselineOwner(db, userId))) {
      return Response.json({ error: "This is a private record." }, { status: 403, headers: NO_STORE });
    }
    const [existing] = await db
      .select({ userId: appleHealthSyncs.userId })
      .from(appleHealthSyncs)
      .where(eq(appleHealthSyncs.userId, userId))
      .limit(1);

    const token = generateAppleHealthSyncToken();
    const now = new Date().toISOString();
    const tokenHash = await hashAppleHealthSyncToken(token);
    if (existing) {
      // Rotation revokes the previous token without discarding synced records
      // or pretending that a new Apple upload happened.
      await db
        .update(appleHealthSyncs)
        .set({ tokenHash, updatedAt: now })
        .where(eq(appleHealthSyncs.userId, userId));
    } else {
      await db.insert(appleHealthSyncs).values({
        userId,
        tokenHash,
        payload: JSON.stringify(emptyAppleHealthSyncPayload()),
        createdAt: now,
        updatedAt: now,
        lastSyncedAt: null,
      });
    }

    return Response.json({ token, endpoint: "/api/apple-health-sync" }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return storageError(error);
  }
}

/** Revokes the bearer token and removes the separately synced Apple record. */
export async function DELETE() {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in with ChatGPT." }, { status: 401, headers: NO_STORE });

  try {
    const db = getDb();
    if (!(await isBaselineOwner(db, userId))) {
      return Response.json({ error: "This is a private record." }, { status: 403, headers: NO_STORE });
    }
    await db.delete(appleHealthSyncs).where(eq(appleHealthSyncs.userId, userId));
    return Response.json({ configured: false, lastSyncedAt: null }, { headers: NO_STORE });
  } catch (error) {
    return storageError(error);
  }
}
