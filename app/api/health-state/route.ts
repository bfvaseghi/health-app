import { and, desc, eq, notInArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { appleHealthSyncs, healthStateBackups, healthStates } from "../../../db/schema";
import { normalizeAppleHealthSyncPayload } from "../../apple-health-sync";
import { getChatGPTUser } from "../../chatgpt-auth";
import { HealthState, findRetiredFields, mergeRecords, normalizeHealthState } from "../../health-model";

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

type Database = ReturnType<typeof getDb>;
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

/** Apple owns its small wellness lane and never mutates the editable state row. */
function composeAppleSync(state: HealthState, apple: StoredAppleSync | undefined): HealthState {
  if (!apple) return state;
  let payload: unknown;
  try {
    payload = JSON.parse(apple.payload);
  } catch {
    return state;
  }
  const records = normalizeAppleHealthSyncPayload(payload);
  if (!records.dailyEntries.length && !records.sleepEntries.length) return state;
  const merged = mergeRecords(state, records);
  return normalizeHealthState({
    ...merged,
    updatedAt: state.updatedAt > apple.updatedAt ? state.updatedAt : apple.updatedAt,
  });
}

function revisionHeaders(revision: number): HeadersInit {
  return { "Cache-Control": "no-store", ETag: `"${revision}"` };
}

/**
 * Rewrites the saved record and every snapshot without the fields this version
 * retired. Normalization drops them whenever a payload is read, but the stored
 * JSON keeps them until something writes over it, so this does the writing.
 *
 * Snapshots are fetched one at a time rather than all at once: a payload can run
 * to a megabyte and thirty of them do not need to be in memory together. This
 * only runs when a retired field is actually found, so it happens once.
 */
async function purgeRetiredData(db: Database, userId: string, state: HealthState): Promise<number> {
  await db
    .update(healthStates)
    .set({ payload: JSON.stringify(state) })
    .where(eq(healthStates.userId, userId));

  const ids = await db
    .select({ id: healthStateBackups.id })
    .from(healthStateBackups)
    .where(eq(healthStateBackups.userId, userId))
    .orderBy(desc(healthStateBackups.createdAt), desc(healthStateBackups.id))
    .limit(BACKUP_LIMIT);

  let cleaned = 0;
  for (const { id } of ids) {
    const [snapshot] = await db
      .select({ payload: healthStateBackups.payload })
      .from(healthStateBackups)
      .where(and(eq(healthStateBackups.id, id), eq(healthStateBackups.userId, userId)))
      .limit(1);
    if (!snapshot) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(snapshot.payload);
    } catch {
      continue;
    }
    if (!findRetiredFields(parsed).fields.length) continue;

    await db
      .update(healthStateBackups)
      .set({ payload: JSON.stringify(normalizeHealthState(parsed)) })
      .where(eq(healthStateBackups.id, id));
    cleaned += 1;
  }

  return cleaned;
}

export async function GET() {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in with ChatGPT." }, { status: 401 });

  try {
    const db = getDb();
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
      if (!apple) return Response.json({ state: null, revision: 0 }, { headers: revisionHeaders(0) });
      const state = composeAppleSync(normalizeHealthState({ updatedAt: apple.updatedAt }), apple);
      return Response.json(
        { state, updatedAt: state.updatedAt, revision: 0 },
        { headers: revisionHeaders(0) },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payload);
    } catch {
      return Response.json({ error: "The saved record could not be read." }, { status: 422 });
    }

    const retired = findRetiredFields(parsed);
    const normalized = normalizeHealthState(parsed);
    const base = normalizeHealthState({ ...normalized, updatedAt: row.updatedAt });
    const snapshots = retired.fields.length ? await purgeRetiredData(db, userId, base) : 0;
    const state = composeAppleSync(base, apple);
    const updatedAt = state.updatedAt;
    return Response.json(
      {
        state,
        updatedAt,
        revision: row.revision,
        ...(retired.fields.length ? { purged: { ...retired, snapshots } } : {}),
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
    const [current] = await db
      .select({ payload: healthStates.payload, updatedAt: healthStates.updatedAt, revision: healthStates.revision })
      .from(healthStates)
      .where(eq(healthStates.userId, userId))
      .limit(1);

    const conflict = async () => {
      const [[latest], [apple]] = await Promise.all([
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
      const parsedLatest = parseStoredState(latest);
      const latestState = parsedLatest ? composeAppleSync(parsedLatest, apple) : null;
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

    const nextRevision = expected + 1;
    const written = current
      ? await db
          .update(healthStates)
          .set({ payload, updatedAt: now, revision: nextRevision })
          .where(and(eq(healthStates.userId, userId), eq(healthStates.revision, expected)))
          .returning({ revision: healthStates.revision })
      : await db
          .insert(healthStates)
          .values({ userId, payload, updatedAt: now, revision: nextRevision })
          .onConflictDoNothing({ target: healthStates.userId })
          .returning({ revision: healthStates.revision });

    if (!written.length) return conflict();

    if (current?.payload && current.payload !== payload) {
      // Snapshot the previous record in this version's shape, so a retired field
      // cannot re-enter storage through the recovery history.
      let previous = current.payload;
      try {
        previous = JSON.stringify(normalizeHealthState(JSON.parse(previous)));
      } catch {
        previous = current.payload;
      }
      await db.insert(healthStateBackups).values({
        userId,
        payload: previous,
        createdAt: now,
      });

      // Keep the newest, delete the rest. An OFFSET with no LIMIT is a syntax
      // error in SQLite, so the prune is expressed as "everything but these".
      const keep = await db
        .select({ id: healthStateBackups.id })
        .from(healthStateBackups)
        .where(eq(healthStateBackups.userId, userId))
        .orderBy(desc(healthStateBackups.createdAt), desc(healthStateBackups.id))
        .limit(BACKUP_LIMIT);
      if (keep.length === BACKUP_LIMIT) {
        await db.delete(healthStateBackups).where(
          and(
            eq(healthStateBackups.userId, userId),
            notInArray(healthStateBackups.id, keep.map((row) => row.id)),
          ),
        );
      }
    }

    return Response.json(
      { state, updatedAt: now, revision: nextRevision },
      { headers: revisionHeaders(nextRevision) },
    );
  } catch (error) {
    return routeError(error);
  }
}
