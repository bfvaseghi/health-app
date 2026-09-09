import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { stateBackupQuery } from "../db/state-backup.ts";

test("updates can back up existing records and stale writers cannot add a snapshot", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE health_states (user_id TEXT PRIMARY KEY, payload TEXT, updated_at TEXT, revision INTEGER);
    CREATE TABLE health_state_backups (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, payload TEXT, created_at TEXT, replaced_revision INTEGER);
    CREATE UNIQUE INDEX backup_revision ON health_state_backups(user_id, replaced_revision);`);
  sqlite.prepare("INSERT INTO health_states VALUES (?, ?, ?, ?)").run("fake-owner", '{"meditationMinutes":10}', "2026-09-08", 1);
  sqlite.prepare("INSERT INTO health_states VALUES (?, ?, ?, ?)").run("other-fake-owner", '{"meditationMinutes":20}', "2026-09-08", 1);
  const db = drizzle(async () => ({ rows: [] }));
  const run = revision => {
    const query = stateBackupQuery(db, "fake-owner", revision, "2026-09-08T12:00:00Z").toSQL();
    return sqlite.prepare(query.sql).run(...query.params);
  };
  assert.equal(run(1).changes, 1);
  sqlite.prepare("UPDATE health_states SET revision = 2, payload = ? WHERE user_id = ?").run('{"meditationMinutes":15}', "fake-owner");
  assert.equal(run(1).changes, 0, "a stale update creates no backup");
  assert.equal(run(2).changes, 1, "subsequent saves allocate a fresh backup ID");
  const rows = sqlite.prepare("SELECT * FROM health_state_backups ORDER BY id").all();
  assert.deepEqual(rows.map(row => [row.id, row.user_id, row.replaced_revision, row.payload]), [[1, "fake-owner", 1, '{"meditationMinutes":10}'], [2, "fake-owner", 2, '{"meditationMinutes":15}']]);
  assert.ok(rows.every(row => row.created_at === "2026-09-08T12:00:00Z"));
  sqlite.close();
});
