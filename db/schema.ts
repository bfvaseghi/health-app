import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const healthStates = sqliteTable("health_states", {
  userId: text("user_id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
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
