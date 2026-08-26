import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { healthStateBackups } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { normalizeHealthState } from "../../../health-model";

const SNAPSHOT_LIMIT = 30;

function routeError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return Response.json({ error: "Private storage is still being prepared." }, { status: 503 });
  }
  return Response.json({ error: "Private storage is temporarily unavailable." }, { status: 500 });
}

/**
 * Reads the snapshots the save route already retains. The list deliberately asks
 * D1 for payload sizes rather than payloads: recovering one snapshot should not
 * mean shipping thirty copies of a health record to the browser.
 */
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  const userId = user?.email.toLowerCase() ?? null;
  if (!userId) return Response.json({ error: "Sign in with ChatGPT." }, { status: 401 });

  const requested = new URL(request.url).searchParams.get("id");

  try {
    const db = getDb();

    if (requested !== null) {
      const id = Number(requested);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return Response.json({ error: "Unknown snapshot." }, { status: 400 });
      }

      const [row] = await db
        .select({ payload: healthStateBackups.payload, createdAt: healthStateBackups.createdAt })
        .from(healthStateBackups)
        .where(and(eq(healthStateBackups.id, id), eq(healthStateBackups.userId, userId)))
        .limit(1);
      if (!row) return Response.json({ error: "Unknown snapshot." }, { status: 404 });

      let parsed: unknown;
      try {
        parsed = JSON.parse(row.payload);
      } catch {
        return Response.json({ error: "That snapshot could not be read." }, { status: 422 });
      }
      return Response.json({ id, createdAt: row.createdAt, state: normalizeHealthState(parsed) });
    }

    const rows = await db
      .select({
        id: healthStateBackups.id,
        createdAt: healthStateBackups.createdAt,
        // Cast to a blob first: SQLite's length() counts characters on text.
        bytes: sql<number>`length(cast(${healthStateBackups.payload} as blob))`,
      })
      .from(healthStateBackups)
      .where(eq(healthStateBackups.userId, userId))
      .orderBy(desc(healthStateBackups.createdAt), desc(healthStateBackups.id))
      .limit(SNAPSHOT_LIMIT);

    return Response.json({ snapshots: rows });
  } catch (error) {
    return routeError(error);
  }
}
