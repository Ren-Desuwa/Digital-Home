import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// A household is an atomic aggregate. Compare-and-swap revisions serialize
// completions, approvals and reward spending across devices without lost writes.
export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  data: text("data").notNull(),
});
export const attempts = sqliteTable("attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expires: integer("expires").notNull(),
});
export const oauthFlows = sqliteTable("oauth_flows", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  expires: integer("expires").notNull(),
});
