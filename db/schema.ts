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
    replacedRevision: integer("replaced_revision"),
  },
  (table) => [
    index("health_state_backups_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("health_state_backups_user_revision_uidx").on(table.userId, table.replacedRevision),
  ],
);

export const baselineOwner = sqliteTable("baseline_owner", {
  singleton: integer("singleton").primaryKey(),
  userId: text("user_id").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

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
    revision: integer("revision").notNull().default(0),
  },
  (table) => [uniqueIndex("apple_health_syncs_token_hash_uidx").on(table.tokenHash)],
);
