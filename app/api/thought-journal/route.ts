import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { appleHealthSyncs, healthStateBackups, healthStates } from "../../../db/schema";
import { hashAppleHealthSyncToken } from "../../apple-health-sync";
import { isBaselineOwner } from "../../baseline-owner";
import { emptyHealthState, normalizeHealthState, todayLocal, upsertThoughtJournalEntry } from "../../health-model";
import { parseThoughtJournalShortcut, thoughtJournalFingerprint } from "../../thought-journal";

const TOKEN_PATTERN = /^blh_[A-Za-z0-9_-]{43}$/;
const MAX_BODY_BYTES = 64_000;
const MAX_STATE_BYTES = 1_500_000;
const BACKUP_LIMIT = 30;
const NO_STORE = { "Cache-Control": "no-store" };

function bearerToken(request: Request): string | null {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get("authorization") ?? "");
  return match && TOKEN_PATTERN.test(match[1]) ? match[1] : null;
}

async function readLimitedBody(request: Request): Promise<{ text: string } | { response: Response }> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { response: Response.json({ error: "Thought payload is too large." }, { status: 413, headers: NO_STORE }) };
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
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return { response: Response.json({ error: "Thought payload is too large." }, { status: 413, headers: NO_STORE }) };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text };
  } catch {
    return { response: Response.json({ error: "Thought payload could not be read." }, { status: 400, headers: NO_STORE }) };
  }
}

async function digestId(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `apple-note-${hex.slice(0, 32)}`;
}

function sameRecord(left: ReturnType<typeof normalizeHealthState>, right: ReturnType<typeof normalizeHealthState>) {
  return JSON.stringify({ ...left, updatedAt: "" }) === JSON.stringify({ ...right, updatedAt: "" });
}

function ingestError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return Response.json({ error: "Thought Journal sync is still being prepared." }, { status: 503, headers: NO_STORE });
  }
  // Never log this endpoint's errors: a database driver error can repeat the
  // bound note text even when the route itself never includes it in a response.
  return Response.json({ error: "Thought Journal sync is temporarily unavailable." }, { status: 500, headers: NO_STORE });
}

/** Adds one selected Apple Note. The shared bearer key never grants read access. */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ error: "Invalid connection key." }, { status: 401, headers: NO_STORE });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Thought payload must use application/json." }, { status: 415, headers: NO_STORE });
  }

  try {
    const db = getDb();
    const tokenHash = await hashAppleHealthSyncToken(token);
    const [connection] = await db
      .select({ userId: appleHealthSyncs.userId })
      .from(appleHealthSyncs)
      .where(eq(appleHealthSyncs.tokenHash, tokenHash))
      .limit(1);
    if (!connection || !(await isBaselineOwner(db, connection.userId))) {
      return Response.json({ error: "Invalid connection key." }, { status: 401, headers: NO_STORE });
    }

    const body = await readLimitedBody(request);
    if ("response" in body) return body.response;
    let raw: unknown;
    try {
      raw = JSON.parse(body.text);
    } catch {
      return Response.json({ error: "Thought payload must be valid JSON." }, { status: 400, headers: NO_STORE });
    }
    const parsed = parseThoughtJournalShortcut(raw, todayLocal());
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 422, headers: NO_STORE });

    const id = await digestId(thoughtJournalFingerprint(parsed.value));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [row] = await db
        .select({ payload: healthStates.payload, revision: healthStates.revision })
        .from(healthStates)
        .where(eq(healthStates.userId, connection.userId))
        .limit(1);

      let current;
      try {
        current = row ? normalizeHealthState(JSON.parse(row.payload)) : emptyHealthState();
      } catch {
        return Response.json({ error: "The saved record could not be read." }, { status: 422, headers: NO_STORE });
      }
      const existing = current.thoughtJournal.find((entry) => entry.id === id);
      const now = new Date().toISOString();
      const next = upsertThoughtJournalEntry(current, {
        id,
        date: parsed.value.date,
        title: parsed.value.title,
        text: parsed.value.text,
        source: "apple-notes",
        createdAt: existing?.createdAt ?? (parsed.value.createdAt || now),
      });
      if (sameRecord(current, next)) {
        return Response.json({ stored: true, unchanged: true, id, date: parsed.value.date, revision: row?.revision ?? 0 }, { headers: NO_STORE });
      }
      const payload = JSON.stringify(next);
      if (new TextEncoder().encode(payload).byteLength > MAX_STATE_BYTES) {
        return Response.json({ error: "Baseline's saved record is too large." }, { status: 413, headers: NO_STORE });
      }

      const expected = row?.revision ?? 0;
      const revision = expected + 1;
      if (!row) {
        const written = await db
          .insert(healthStates)
          .values({ userId: connection.userId, payload, updatedAt: now, revision })
          .onConflictDoNothing({ target: healthStates.userId })
          .returning({ revision: healthStates.revision });
        if (!written.length) continue;
      } else {
        const backup = db.insert(healthStateBackups).select(
          db
            .select({
              userId: healthStates.userId,
              payload: healthStates.payload,
              createdAt: sql<string>`${now}`,
              replacedRevision: healthStates.revision,
            })
            .from(healthStates)
            .where(and(eq(healthStates.userId, connection.userId), eq(healthStates.revision, expected))),
        );
        const write = db
          .update(healthStates)
          .set({ payload, updatedAt: now, revision })
          .where(and(eq(healthStates.userId, connection.userId), eq(healthStates.revision, expected)))
          .returning({ revision: healthStates.revision });
        const keep = db
          .select({ id: healthStateBackups.id })
          .from(healthStateBackups)
          .where(eq(healthStateBackups.userId, connection.userId))
          .orderBy(desc(healthStateBackups.createdAt), desc(healthStateBackups.id))
          .limit(BACKUP_LIMIT);
        const prune = db.delete(healthStateBackups).where(
          and(eq(healthStateBackups.userId, connection.userId), notInArray(healthStateBackups.id, keep)),
        );
        const [, written] = await db.batch([backup, write, prune]);
        if (!written.length) continue;
      }

      return Response.json({ stored: true, id, date: parsed.value.date, revision }, { status: 201, headers: NO_STORE });
    }
    return Response.json(
      { error: "Another save is still being merged. Retry shortly." },
      { status: 503, headers: { ...NO_STORE, "Retry-After": "2" } },
    );
  } catch (error) {
    return ingestError(error);
  }
}
