import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { appleHealthSyncs, healthStateBackups, healthStates } from "../../../db/schema";
import { normalizeAppleHealthSyncPayload } from "../../apple-health-sync";
import { isBaselineOwner } from "../../baseline-owner";
import { getChatGPTUser } from "../../chatgpt-auth";
import { HealthState, emptyHealthState, normalizeHealthState } from "../../health-model";

const MAX_PAYLOAD_BYTES = 1_500_000;
const BACKUP_LIMIT = 30;

function routeError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return Response.json({ error: "Private storage is still being prepared." }, { status: 503 });
  }
  // First line only: a driver error repeats the bound parameters below it, and
  // those carry the user's identifier and record.
  console.error("health-state:", message.split("\n")[0]);
  return Response.json({ error: "Private storage is temporarily unavailable." }, { status: 500 });
}

async function authenticatedUserId(): Promise<string | null> {
  const user = await getChatGPTUser();
  return user?.email.toLowerCase() ?? null;
}

type StoredState = { payload: string; updatedAt: string; revision: number };
type StoredAppleSync = { payload: string; updatedAt: string };

function expectedRevision(request: Request): number | null {
  const match = /^"(\d+)"$/.exec(request.headers.get("if-match") ?? "");
  if (!match) return null;
  const revision = Number(match[1]);
  return Number.isSafeInteger(revision) ? revision : null;
}

function parseStoredState(row: StoredState | undefined): HealthState | null {
  if (!row) return null;
  try {
    const normalized = normalizeHealthState(JSON.parse(row.payload));
    return normalizeHealthState({ ...normalized, updatedAt: row.updatedAt });
  } catch {
    return null;
  }
}

function sameRecord(left: HealthState, right: HealthState): boolean {
  return JSON.stringify({ ...left, updatedAt: "" }) === JSON.stringify({ ...right, updatedAt: "" });
}

/** Apple stays an overlay. It is displayed in memory and is never PUT back. */
function readAppleSync(apple: StoredAppleSync | undefined) {
  if (!apple) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(apple.payload);
  } catch {
    return null;
  }
  const records = normalizeAppleHealthSyncPayload(payload);
  return records.dailyEntries.length || records.sleepEntries.length ? records : null;
}

function revisionHeaders(revision: number): HeadersInit {
  return { "Cache-Control": "no-store", ETag: `"${revision}"` };
}

export async function GET() {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in with ChatGPT." }, { status: 401 });

  try {
    const db = getDb();
    if (!(await isBaselineOwner(db, userId))) {
      return Response.json({ error: "This is a private record." }, { status: 403 });
    }
    const [[row], [apple]] = await Promise.all([
      db
        .select({ payload: healthStates.payload, updatedAt: healthStates.updatedAt, revision: healthStates.revision })
        .from(healthStates)
        .where(eq(healthStates.userId, userId))
        .limit(1),
      db
        .select({ payload: appleHealthSyncs.payload, updatedAt: appleHealthSyncs.updatedAt })
        .from(appleHealthSyncs)
        .where(eq(appleHealthSyncs.userId, userId))
        .limit(1),
    ]);

    if (!row) {
      return Response.json(
        { state: null, appleOverlay: readAppleSync(apple), revision: 0 },
        { headers: revisionHeaders(0) },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payload);
    } catch {
      return Response.json({ error: "The saved record could not be read." }, { status: 422 });
    }

    const normalized = normalizeHealthState(parsed);
    const base = normalizeHealthState({ ...normalized, updatedAt: row.updatedAt });
    return Response.json(
      {
        state: base,
        appleOverlay: readAppleSync(apple),
        updatedAt: base.updatedAt,
        revision: row.revision,
      },
      { headers: revisionHeaders(row.revision) },
    );
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in with ChatGPT." }, { status: 401 });

  const expected = expectedRevision(request);
  if (expected === null) {
    return Response.json(
      { error: "Reload Baseline before saving this change." },
      { status: 428, headers: { "Cache-Control": "no-store" } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return Response.json({ error: "Health record is too large." }, { status: 413 });
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return Response.json({ error: "Request could not be read." }, { status: 400 });
  }
  if (new TextEncoder().encode(text).byteLength > MAX_PAYLOAD_BYTES) {
    return Response.json({ error: "Health record is too large." }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "Health record must be valid JSON." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const state = normalizeHealthState({ ...(parsed as object), updatedAt: now });
  const payload = JSON.stringify(state);

  try {
    const db = getDb();
    if (!(await isBaselineOwner(db, userId))) {
      return Response.json({ error: "This is a private record." }, { status: 403 });
    }
    const [current] = await db
      .select({ payload: healthStates.payload, updatedAt: healthStates.updatedAt, revision: healthStates.revision })
      .from(healthStates)
      .where(eq(healthStates.userId, userId))
      .limit(1);

    const conflict = async () => {
      const [latest] = await db
        .select({ payload: healthStates.payload, updatedAt: healthStates.updatedAt, revision: healthStates.revision })
        .from(healthStates)
        .where(eq(healthStates.userId, userId))
        .limit(1);
      const parsedLatest = parseStoredState(latest);
      const latestState = parsedLatest;
      const revision = latest?.revision ?? 0;
      return Response.json(
        {
          error: "A newer save arrived first.",
          state: latestState,
          updatedAt: latestState?.updatedAt ?? latest?.updatedAt ?? null,
          revision,
        },
        { status: 409, headers: revisionHeaders(revision) },
      );
    };

    if (expected !== (current?.revision ?? 0)) return conflict();

    const currentState = parseStoredState(current);
    if (currentState && sameRecord(currentState, state)) {
      return Response.json(
        { state: currentState, updatedAt: currentState.updatedAt, revision: current.revision },
        { headers: revisionHeaders(current.revision) },
      );
    }

    const nextRevision = expected + 1;
    if (!current) {
      const written = await db
          .insert(healthStates)
          .values({ userId, payload, updatedAt: now, revision: nextRevision })
          .onConflictDoNothing({ target: healthStates.userId })
          .returning({ revision: healthStates.revision });
      if (!written.length) return conflict();
    } else {
      // D1 batches are transactional. The snapshot insert is conditional on the
      // same revision as the update, so a losing concurrent writer commits
      // neither a replacement nor a misleading recovery point.
      const backup = db.insert(healthStateBackups).select(
        db
          .select({
            userId: healthStates.userId,
            payload: healthStates.payload,
            createdAt: sql<string>`${now}`,
            replacedRevision: healthStates.revision,
          })
          .from(healthStates)
          .where(and(eq(healthStates.userId, userId), eq(healthStates.revision, expected))),
      );
      const write = db
        .update(healthStates)
        .set({ payload, updatedAt: now, revision: nextRevision })
        .where(and(eq(healthStates.userId, userId), eq(healthStates.revision, expected)))
        .returning({ revision: healthStates.revision });
      const keep = db
        .select({ id: healthStateBackups.id })
        .from(healthStateBackups)
        .where(eq(healthStateBackups.userId, userId))
        .orderBy(desc(healthStateBackups.createdAt), desc(healthStateBackups.id))
        .limit(BACKUP_LIMIT);
      const prune = db.delete(healthStateBackups).where(
        and(
          eq(healthStateBackups.userId, userId),
          notInArray(healthStateBackups.id, keep),
        ),
      );
      const [, written] = await db.batch([backup, write, prune]);
      if (!written.length) return conflict();
    }

    return Response.json(
      { state, updatedAt: now, revision: nextRevision },
      { headers: revisionHeaders(nextRevision) },
    );
  } catch (error) {
    return routeError(error);
  }
}

/** Irreversible owner action: keep preferences, remove every record and recovery copy. */
export async function DELETE() {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in with ChatGPT." }, { status: 401 });

  try {
    const db = getDb();
    if (!(await isBaselineOwner(db, userId))) {
      return Response.json({ error: "This is a private record." }, { status: 403 });
    }
    const [current] = await db
      .select({ payload: healthStates.payload, updatedAt: healthStates.updatedAt, revision: healthStates.revision })
      .from(healthStates)
      .where(eq(healthStates.userId, userId))
      .limit(1);
    const previous = parseStoredState(current);
    const now = new Date().toISOString();
    const cleared = normalizeHealthState({
      ...emptyHealthState(new Date(now)),
      updatedAt: now,
      goals: previous?.goals,
    });
    const revision = (current?.revision ?? 0) + 1;
    const write = db
      .insert(healthStates)
      .values({ userId, payload: JSON.stringify(cleared), updatedAt: now, revision })
      .onConflictDoUpdate({
        target: healthStates.userId,
        set: { payload: JSON.stringify(cleared), updatedAt: now, revision },
      });
    await db.batch([
      db.delete(healthStateBackups).where(eq(healthStateBackups.userId, userId)),
      db.delete(appleHealthSyncs).where(eq(appleHealthSyncs.userId, userId)),
      write,
    ]);
    return Response.json(
      { state: cleared, updatedAt: now, revision, appleOverlay: null },
      { headers: revisionHeaders(revision) },
    );
  } catch (error) {
    return routeError(error);
  }
}
