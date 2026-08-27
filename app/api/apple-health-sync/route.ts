import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { appleHealthSyncs } from "../../../db/schema";
import {
  emptyAppleHealthSyncPayload,
  hashAppleHealthSyncToken,
  mergeAppleHealthSyncPayload,
  parseAppleHealthSync,
} from "../../apple-health-sync";

const MAX_SYNC_BYTES = 512_000;
const TOKEN_PATTERN = /^blh_[A-Za-z0-9_-]{43}$/;
const NO_STORE = { "Cache-Control": "no-store" };

function bearerToken(request: Request): string | null {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get("authorization") ?? "");
  return match && TOKEN_PATTERN.test(match[1]) ? match[1] : null;
}

function syncError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return Response.json({ error: "Apple Health sync is still being prepared." }, { status: 503, headers: NO_STORE });
  }
  // Do not log this route's errors. A driver error can carry a bound payload,
  // and this endpoint receives health records without an interactive owner.
  return Response.json({ error: "Apple Health sync is temporarily unavailable." }, { status: 500, headers: NO_STORE });
}

async function readLimitedBody(request: Request): Promise<{ text: string } | { response: Response }> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_SYNC_BYTES) {
    return { response: Response.json({ error: "Sync payload is too large." }, { status: 413, headers: NO_STORE }) };
  }
  if (!request.body) return { text: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_SYNC_BYTES) {
        await reader.cancel();
        return { response: Response.json({ error: "Sync payload is too large." }, { status: 413, headers: NO_STORE }) };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text };
  } catch {
    return { response: Response.json({ error: "Sync payload could not be read." }, { status: 400, headers: NO_STORE }) };
  }
}

/**
 * Health Auto Export calls this route with the one-time bearer token. Only the
 * Apple wellness whitelist and Apple sleep can reach storage.
 */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ error: "Invalid sync token." }, { status: 401, headers: NO_STORE });

  try {
    const db = getDb();
    const tokenHash = await hashAppleHealthSyncToken(token);
    const [connection] = await db
      .select({ userId: appleHealthSyncs.userId })
      .from(appleHealthSyncs)
      .where(eq(appleHealthSyncs.tokenHash, tokenHash))
      .limit(1);
    if (!connection) return Response.json({ error: "Invalid sync token." }, { status: 401, headers: NO_STORE });

    const body = await readLimitedBody(request);
    if ("response" in body) return body.response;

    let raw: unknown;
    try {
      raw = JSON.parse(body.text);
    } catch {
      return Response.json({ error: "Sync payload must be valid JSON." }, { status: 400, headers: NO_STORE });
    }

    const parsed = parseAppleHealthSync(raw);
    if (!parsed) {
      return Response.json({ error: "Sync payload is not a Health Auto Export metric bundle." }, { status: 422, headers: NO_STORE });
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [row] = await db
        .select({
          userId: appleHealthSyncs.userId,
          payload: appleHealthSyncs.payload,
          revision: appleHealthSyncs.revision,
        })
        .from(appleHealthSyncs)
        .where(eq(appleHealthSyncs.tokenHash, tokenHash))
        .limit(1);
      if (!row) return Response.json({ error: "Sync key was revoked." }, { status: 401, headers: NO_STORE });

      let current: unknown = emptyAppleHealthSyncPayload();
      try {
        current = JSON.parse(row.payload);
      } catch {
        // The next valid normalized export repairs a malformed stored payload.
      }
      const merged = mergeAppleHealthSyncPayload(current, parsed.payload);
      const payload = JSON.stringify(merged.payload);
      if (new TextEncoder().encode(payload).byteLength > MAX_SYNC_BYTES) {
        return Response.json({ error: "Stored Apple Health history is too large." }, { status: 413, headers: NO_STORE });
      }
      const now = new Date().toISOString();
      const written = await db
        .update(appleHealthSyncs)
        .set({ payload, updatedAt: now, lastSyncedAt: now, revision: row.revision + 1 })
        .where(and(
          eq(appleHealthSyncs.userId, row.userId),
          eq(appleHealthSyncs.tokenHash, tokenHash),
          eq(appleHealthSyncs.revision, row.revision),
        ))
        .returning({ revision: appleHealthSyncs.revision });
      if (!written.length) continue;

      return Response.json(
        {
          receivedDays: parsed.payload.dailyEntries.length,
          receivedNights: parsed.payload.sleepEntries.length,
          changedDays: merged.changedDays,
          changedNights: merged.changedNights,
          storedDays: merged.payload.dailyEntries.length,
          storedNights: merged.payload.sleepEntries.length,
          ignoredMetricTypes: parsed.ignoredMetricTypes,
          skippedSamples: parsed.skippedSamples,
        },
        { headers: NO_STORE },
      );
    }
    return Response.json(
      { error: "Another sync is still being merged. Retry shortly." },
      { status: 503, headers: { ...NO_STORE, "Retry-After": "2" } },
    );
  } catch (error) {
    return syncError(error);
  }
}
