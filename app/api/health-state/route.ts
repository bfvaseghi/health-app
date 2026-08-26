import { and, desc, eq, notInArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { healthStateBackups, healthStates } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { HealthState, findRetiredFields, normalizeHealthState } from "../../health-model";

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
    const [row] = await db
      .select({ payload: healthStates.payload, updatedAt: healthStates.updatedAt })
      .from(healthStates)
      .where(eq(healthStates.userId, userId))
      .limit(1);

    if (!row) return Response.json({ state: null });

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payload);
    } catch {
      return Response.json({ error: "The saved record could not be read." }, { status: 422 });
    }

    const retired = findRetiredFields(parsed);
    if (!retired.fields.length) return Response.json({ state: parsed, updatedAt: row.updatedAt });

    const state = normalizeHealthState(parsed);
    const snapshots = await purgeRetiredData(db, userId, state);
    return Response.json({ state, updatedAt: row.updatedAt, purged: { ...retired, snapshots } });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in with ChatGPT." }, { status: 401 });

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
      .select({ payload: healthStates.payload })
      .from(healthStates)
      .where(eq(healthStates.userId, userId))
      .limit(1);

    await db
      .insert(healthStates)
      .values({ userId, payload, updatedAt: now })
      .onConflictDoUpdate({
        target: healthStates.userId,
        set: { payload, updatedAt: now },
      });

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

    return Response.json({ state, updatedAt: now });
  } catch (error) {
    return routeError(error);
  }
}
