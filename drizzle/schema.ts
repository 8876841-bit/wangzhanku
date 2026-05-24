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
  "parked",          // 暂存，不处理
  "discarded",       // 放弃，不入库
] as const;
export type EntryStatus = typeof ENTRY_STATUSES[number];

// ── Processing modes (处理方式) ──────────────────────────────────────────────
export const PROCESSING_MODES = [
  "recognize_only",   // 只识别：只还原文字/图片，不分析
  "organize",         // 识别整理：轻分析，判断意图+分类+下一步（默认）
  "archive",          // 分类入库：生成结构化内容，等待确认入库
  "deepdive",         // 深挖这个：完整长分析
] as const;
export type ProcessingMode = typeof PROCESSING_MODES[number];

// ── Source types (信息来源) ──────────────────────────────────────────────────
export const SOURCE_TYPES = [
  "manual_note",    // 手写笔记
  "screenshot",     // 截图
  "text",           // 文字想法
  "voice",          // 语音
  "douyin",         // 抖音
  "xiaohongshu",    // 小红书
  "bilibili",       // B站
  "podcast",        // 播客
  "article",        // 文章
  "github",         // GitHub
  "other",          // 其他
] as const;
export type SourceType = typeof SOURCE_TYPES[number];

// ── Information density levels ───────────────────────────────────────────────
export const DENSITY_LEVELS = ["high", "medium", "low"] as const;
export type DensityLevel = typeof DENSITY_LEVELS[number];

// ── Entry batches (批次) ─────────────────────────────────────────────────────
export const entryBatches = mysqlTable("entry_batches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }),
  context: text("context"),           // 批次背景说明
  overallTheme: text("overallTheme"), // AI 判断的整体主题
  entryCount: int("entryCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EntryBatch = typeof entryBatches.$inferSelect;
export type InsertEntryBatch = typeof entryBatches.$inferInsert;

// ── Main entries table ───────────────────────────────────────────────────────
export const entries = mysqlTable("entries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),

  // Input
  rawText: text("rawText"),
  imageUrl: text("imageUrl"),

  // Processing mode & source
  processingMode: mysqlEnum("processingMode", PROCESSING_MODES).default("organize").notNull(),
  sourceType: mysqlEnum("sourceType", SOURCE_TYPES).default("text").notNull(),
  sourceName: varchar("sourceName", { length: 255 }),  // e.g. "抖音@xxx"
  sourceUrl: text("sourceUrl"),                        // 原始链接

  // User intent (关注点)
  attentionPoint: text("attentionPoint"),  // 我为什么记录它 / 我关注的点

  // Batch
  batchId: int("batchId"),

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

  // Information density (信息密度)
  densityScore: float("densityScore"),                          // 0-10
  densityLevel: mysqlEnum("densityLevel", DENSITY_LEVELS),     // high/medium/low
  densityReason: text("densityReason"),                        // 一句人话解释

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

  // Next action (what to do next)
  nextActionType: varchar("nextActionType", { length: 64 }),
  nextAction: text("nextAction"),

  // Three-layer interpretation
  aiInterpretation: text("aiInterpretation"),      // AI first pass
  finalInterpretation: text("finalInterpretation"), // after user correction

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
  // Upgrade conditions tracking
  hasCaseEntry: tinyint("hasCaseEntry").default(0).notNull(),      // 至少1个真实案例
  hasUserCorrection: tinyint("hasUserCorrection").default(0).notNull(), // 至少1次用户校正
  hasActionGuidance: tinyint("hasActionGuidance").default(0).notNull(), // 能指导行动
  applicableScenario: text("applicableScenario"),                  // 明确适用场景
  status: mysqlEnum("status", ["accumulating", "upgradeable", "upgraded"]).default("accumulating").notNull(),
  githubPath: text("githubPath"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EntryCluster = typeof entryClusters.$inferSelect;
export type InsertEntryCluster = typeof entryClusters.$inferInsert;

// ── Entry relations (认知关系图谱) ────────────────────────────────────────────
export const RELATION_TYPES = [
  "similar",       // 相似
  "supports",      // 支撑
  "explains",      // 解释
  "example_of",    // 案例
  "contradicts",   // 反例/冲突
  "extends",       // 延伸
  "triggers",      // 触发
  "can_merge",     // 可融合
  "same_cluster",  // 同簇
  "transferable",  // 可迁移
] as const;
export type RelationType = typeof RELATION_TYPES[number];

export const entryRelations = mysqlTable("entry_relations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sourceEntryId: int("sourceEntryId").notNull(),
  targetEntryId: int("targetEntryId").notNull(),
  relationType: mysqlEnum("relationType", RELATION_TYPES).notNull(),
  confidence: float("confidence"),   // 0-1
  reason: text("reason"),            // AI 解释
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EntryRelation = typeof entryRelations.$inferSelect;
export type InsertEntryRelation = typeof entryRelations.$inferInsert;

// ── Fusion results (两点融合) ─────────────────────────────────────────────────
export const fusionResults = mysqlTable("fusion_results", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  entryAId: int("entryAId").notNull(),
  entryBId: int("entryBId").notNull(),
  fusionQuestion: text("fusionQuestion"),    // 融合的核心问题
  fusionSummary: text("fusionSummary"),      // 融合假设总结
  sharedPattern: text("sharedPattern"),      // 共同命题
  conflictPoint: text("conflictPoint"),      // 差异/冲突点
  newPossibility: text("newPossibility"),    // 融合后可能产生的新方向
  suggestedAction: text("suggestedAction"),  // 可生成的新行动
  modelCandidate: text("modelCandidate"),    // 是否有模型候选
  evidenceBasis: text("evidenceBasis"),      // 依据
  invalidConditions: text("invalidConditions"), // 不成立条件
  nextVerification: text("nextVerification"), // 下一步验证
  confidence: float("confidence"),           // 0-1
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FusionResult = typeof fusionResults.$inferSelect;
export type InsertFusionResult = typeof fusionResults.$inferInsert;

// ── GitHub config ────────────────────────────────────────────────────────────
export const githubConfigs = mysqlTable("github_configs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  githubTokenEncrypted: text("githubTokenEncrypted"), // AES-256 encrypted
  repoOwner: varchar("repoOwner", { length: 128 }),
  repoName: varchar("repoName", { length: 128 }),
  branch: varchar("branch", { length: 128 }).default("main"),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GithubConfig = typeof githubConfigs.$inferSelect;
export type InsertGithubConfig = typeof githubConfigs.$inferInsert;
