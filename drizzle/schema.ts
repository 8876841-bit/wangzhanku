import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Knowledge notes table - stores all captured notes with AI analysis
 */
export const notes = mysqlTable("notes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // Original content
  rawText: text("rawText"),           // OCR extracted text or manually typed
  imageUrl: text("imageUrl"),         // S3 URL of uploaded image
  // AI analysis results
  category: mysqlEnum("category", [
    "idea",       // 灵感
    "question",   // 问题
    "person",     // 人名
    "skill",      // 技能
    "todo",       // 待办
    "experience", // 经验
    "quote",      // 引用/金句
    "other",      // 其他
  ]).default("other").notNull(),
  title: varchar("title", { length: 255 }),   // AI generated title
  summary: text("summary"),                   // AI generated summary
  tags: json("tags").$type<string[]>().default([]),  // AI extracted tags
  aiAnswer: text("aiAnswer"),                 // AI answer (for question type)
  researchSuggestions: json("researchSuggestions").$type<string[]>().default([]), // AI research suggestions
  // Status
  status: mysqlEnum("status", ["processing", "draft", "done", "error"]).default("processing").notNull(),
  githubSynced: int("githubSynced").default(0).notNull(), // 0=not synced, 1=synced
  githubPath: text("githubPath"),             // path in GitHub repo
  // New fields for calibration workflow
  topicId: int("topicId"),                    // linked knowledge topic
  noteItemsJson: text("noteItemsJson"),        // structured note items JSON
  coreTheme: varchar("coreTheme", { length: 500 }), // AI-extracted core theme
  connectionInsight: text("connectionInsight"), // AI-extracted connections
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Note = typeof notes.$inferSelect;
export type InsertNote = typeof notes.$inferInsert;

/**
 * Note relations table - stores connections between notes
 */
export const noteRelations = mysqlTable("note_relations", {
  id: int("id").autoincrement().primaryKey(),
  sourceNoteId: int("sourceNoteId").notNull(),
  targetNoteId: int("targetNoteId").notNull(),
  relationType: varchar("relationType", { length: 64 }).default("related"), // related, inspired_by, leads_to, etc.
  description: text("description"),  // AI generated description of the relation
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NoteRelation = typeof noteRelations.$inferSelect;
export type InsertNoteRelation = typeof noteRelations.$inferInsert;

/**
 * GitHub config table - stores user's GitHub integration settings
 */
export const githubConfigs = mysqlTable("github_configs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  githubToken: text("githubToken"),   // encrypted GitHub personal access token
  repoOwner: varchar("repoOwner", { length: 128 }),
  repoName: varchar("repoName", { length: 128 }),
  branch: varchar("branch", { length: 128 }).default("main"),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GithubConfig = typeof githubConfigs.$inferSelect;
export type InsertGithubConfig = typeof githubConfigs.$inferInsert;

/**
 * Knowledge topics table - groups related notes into themes
 */
export const topics = mysqlTable("topics", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  noteCount: int("noteCount").default(0).notNull(),
  githubFolder: varchar("githubFolder", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Topic = typeof topics.$inferSelect;
export type InsertTopic = typeof topics.$inferInsert;
