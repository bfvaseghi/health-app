import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appleHealthSyncs } from "../../../../db/schema";
import {
  emptyAppleHealthSyncPayload,
  generateAppleHealthSyncToken,
  hashAppleHealthSyncToken,
  normalizeAppleHealthSyncPayload,
  mergeRestoredAppleHealthSyncPayload,
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
    return Response.json({ error: "Apple Health sync unavailable." }, { status: 503, headers: NO_STORE });
  }
  return Response.json({ error: "Apple Health sync unavailable." }, { status: 500, headers: NO_STORE });
}

function readOverlay(payload: string | undefined) {
  if (!payload) return null;
  try {
    return normalizeAppleHealthSyncPayload(JSON.parse(payload));
  } catch {
    return null;
  }
}

/** Returns owner-only status and the read-only overlay. The bearer token can never be read back. */
export async function GET() {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401, headers: NO_STORE });

  try {
    const db = getDb();
    if (!(await isBaselineOwner(db, userId))) {
      return Response.json({ error: "Access denied." }, { status: 403, headers: NO_STORE });
    }
    const [row] = await db
      .select({ tokenHash: appleHealthSyncs.tokenHash, lastSyncedAt: appleHealthSyncs.lastSyncedAt, payload: appleHealthSyncs.payload })
      .from(appleHealthSyncs)
      .where(eq(appleHealthSyncs.userId, userId))
      .limit(1);

    return Response.json(
      {
        configured: /^[a-f0-9]{64}$/.test(row?.tokenHash ?? ""),
        lastSyncedAt: row?.lastSyncedAt ?? null,
        appleOverlay: readOverlay(row?.payload),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return storageError(error);
  }
}

/** Creates or rotates the owner's bearer token and returns its raw value once. */
export async function POST() {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401, headers: NO_STORE });

  try {
    const db = getDb();
    if (!(await isBaselineOwner(db, userId))) {
      return Response.json({ error: "Access denied." }, { status: 403, headers: NO_STORE });
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
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401, headers: NO_STORE });

  try {
    const db = getDb();
    if (!(await isBaselineOwner(db, userId))) {
      return Response.json({ error: "Access denied." }, { status: 403, headers: NO_STORE });
    }
    await db.delete(appleHealthSyncs).where(eq(appleHealthSyncs.userId, userId));
    return Response.json({ configured: false, lastSyncedAt: null }, { headers: NO_STORE });
  } catch (error) {
    return storageError(error);
  }
}

/** Restores archived Apple records without changing an existing connection key. */
export async function PUT(request: Request) {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401, headers: NO_STORE });
  try {
    const db = getDb();
    if (!(await isBaselineOwner(db, userId))) {
      return Response.json({ error: "Access denied." }, { status: 403, headers: NO_STORE });
    }
    const limit = 512_000;
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "Empty archive data." }, { status: 400, headers: NO_STORE });
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        return Response.json({ error: "Apple Health history is too large." }, { status: 413, headers: NO_STORE });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    let archived;
    try { archived = normalizeAppleHealthSyncPayload(JSON.parse(text)); }
    catch { return Response.json({ error: "Invalid archive data." }, { status: 400, headers: NO_STORE }); }

    for (let attempt = 0; attempt < 5; attempt++) {
      const [row] = await db.select().from(appleHealthSyncs)
        .where(eq(appleHealthSyncs.userId, userId)).limit(1);
      const appleOverlay = mergeRestoredAppleHealthSyncPayload(archived, readOverlay(row?.payload));
      const payload = JSON.stringify(appleOverlay);
      if (new TextEncoder().encode(payload).byteLength > limit) {
        return Response.json({ error: "Apple Health history is too large." }, { status: 413, headers: NO_STORE });
      }
      const now = new Date().toISOString();
      const written = row
        ? await db.update(appleHealthSyncs).set({ payload, updatedAt: now, revision: row.revision + 1 })
          .where(and(eq(appleHealthSyncs.userId, userId), eq(appleHealthSyncs.revision, row.revision), eq(appleHealthSyncs.tokenHash, row.tokenHash)))
          .returning({ revision: appleHealthSyncs.revision })
        : await db.insert(appleHealthSyncs).values({
          userId, payload, tokenHash: `restored:${crypto.randomUUID()}`,
          createdAt: now, updatedAt: now, lastSyncedAt: null, revision: 1,
        }).onConflictDoNothing().returning({ revision: appleHealthSyncs.revision });
      if (written.length) return Response.json({ appleOverlay }, { headers: NO_STORE });
    }
    return Response.json({ error: "Sync busy. Retry restore." }, { status: 503, headers: NO_STORE });
  } catch (error) {
    return storageError(error);
  }
}
