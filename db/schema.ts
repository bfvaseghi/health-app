import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const healthStates = sqliteTable("health_states", {
  userId: text("user_id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
  revision: integer("revision").notNull().default(1),
});

export const healthStateBackups = sqliteTable(
  "health_state_backups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("health_state_backups_user_created_idx").on(table.userId, table.createdAt)],
);

/**
 * Apple Health stays separate from the user-edited record. The public ingest
 * endpoint knows only a one-time bearer token, whose SHA-256 digest is stored
 * here. The raw token is never persisted.
 */
export const appleHealthSyncs = sqliteTable(
  "apple_health_syncs",
  {
    userId: text("user_id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastSyncedAt: text("last_synced_at"),
  },
  (table) => [uniqueIndex("apple_health_syncs_token_hash_uidx").on(table.tokenHash)],
);
