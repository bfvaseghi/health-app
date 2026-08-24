import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { healthStateBackups, healthStates } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { normalizeHealthState } from "../../health-model";

const MAX_PAYLOAD_BYTES = 1_500_000;
const BACKUP_LIMIT = 30;

function routeError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return Response.json({ error: "Private storage is still being prepared." }, { status: 503 });
  }
  return Response.json({ error: "Private storage is temporarily unavailable." }, { status: 500 });
}

async function authenticatedUserId(): Promise<string | null> {
  const user = await getChatGPTUser();
  return user?.email.toLowerCase() ?? null;
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
    return Response.json({ state: JSON.parse(row.payload), updatedAt: row.updatedAt });
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
      await db.insert(healthStateBackups).values({
        userId,
        payload: current.payload,
        createdAt: now,
      });

      const older = await db
        .select({ id: healthStateBackups.id })
        .from(healthStateBackups)
        .where(eq(healthStateBackups.userId, userId))
        .orderBy(desc(healthStateBackups.createdAt), desc(healthStateBackups.id))
        .offset(BACKUP_LIMIT);
      if (older.length) {
        await db.delete(healthStateBackups).where(inArray(healthStateBackups.id, older.map((row) => row.id)));
      }
    }

    return Response.json({ state, updatedAt: now });
  } catch (error) {
    return routeError(error);
  }
}
