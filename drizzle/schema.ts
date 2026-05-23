import {
  int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, float, tinyint,
} from "drizzle-orm/mysql-core";

// ── Core user table ──────────────────────────────────────────────────────────
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

// ── 11-category classification system ───────────────────────────────────────
export const CATEGORIES = [
  "Concept",     // 概念、定义、术语
  "Person",      // 人物、人名
  "Case",        // 案例、事件
  "Question",    // 问题、疑问
  "Insight",     // 洞察、规律
  "Idea",        // 想法、灵感
  "Skill",       // 技能、方法
  "Action",      // 待办、行动
  "Model",       // 认知模型、框架
  "Trigger",     // 触发点
  "Positioning", // 自我定位
] as const;
export type EntryCategory = typeof CATEGORIES[number];

// ── Entry lifecycle states ───────────────────────────────────────────────────
export const ENTRY_STATUSES = [
  "processing",      // AI 分析中
  "pending_review",  // 待用户校正
  "confirmed",       // 用户已确认（待入库）
  "archived",        // 已入库 GitHub
  "needs_deepdive",  // 待深挖
  "duplicate",       // 重复/待聚合
  "upgradeable",     // 可升级为 Model
  "model",           // 已升级为认知模型
] as const;
export type EntryStatus = typeof ENTRY_STATUSES[number];

// ── Main entries table ───────────────────────────────────────────────────────
export const entries = mysqlTable("entries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),

  // Input
  rawText: text("rawText"),
  imageUrl: text("imageUrl"),

  // AI Analysis
  category: mysqlEnum("category", CATEGORIES).default("Idea").notNull(),
  title: varchar("title", { length: 255 }),
  summary: text("summary"),
  tags: json("tags").$type<string[]>(),
  aiAnswer: text("aiAnswer"),
  researchSuggestions: json("researchSuggestions").$type<string[]>(),
  noteItemsJson: text("noteItemsJson"),
  coreTheme: varchar("coreTheme", { length: 500 }),
  connectionInsight: text("connectionInsight"),

  // Processing state
  status: mysqlEnum("status", ENTRY_STATUSES).default("processing").notNull(),
  needsDeepDive: tinyint("needsDeepDive").default(0).notNull(),
  isDuplicate: tinyint("isDuplicate").default(0).notNull(),
  duplicateOfId: int("duplicateOfId"),
  similarityScore: float("similarityScore"),

  // User correction
  userCorrection: text("userCorrection"),
  correctedCategory: mysqlEnum("correctedCategory", CATEGORIES),
  correctedTitle: varchar("correctedTitle", { length: 255 }),

  // GitHub
  githubSynced: tinyint("githubSynced").default(0).notNull(),
  githubPath: text("githubPath"),

  // Cluster / Model upgrade
  clusterId: int("clusterId"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Entry = typeof entries.$inferSelect;
export type InsertEntry = typeof entries.$inferInsert;

// ── Entry clusters (for Model upgrade) ──────────────────────────────────────
export const entryClusters = mysqlTable("entry_clusters", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  category: mysqlEnum("category", CATEGORIES).default("Model").notNull(),
  description: text("description"),
  modelContent: text("modelContent"),
  entryCount: int("entryCount").default(0).notNull(),
  status: mysqlEnum("status", ["accumulating", "upgradeable", "upgraded"]).default("accumulating").notNull(),
  githubPath: text("githubPath"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EntryCluster = typeof entryClusters.$inferSelect;
export type InsertEntryCluster = typeof entryClusters.$inferInsert;

// ── GitHub config ────────────────────────────────────────────────────────────
export const githubConfigs = mysqlTable("github_configs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  githubToken: text("githubToken"),
  repoOwner: varchar("repoOwner", { length: 128 }),
  repoName: varchar("repoName", { length: 128 }),
  branch: varchar("branch", { length: 128 }).default("main"),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GithubConfig = typeof githubConfigs.$inferSelect;
export type InsertGithubConfig = typeof githubConfigs.$inferInsert;
