import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { entries, entryBatches, entryClusters, entryRelations, fusionResults, githubConfigs } from "../drizzle/schema";
import { eq, desc, and, inArray, or, sql } from "drizzle-orm";
import {
  analyzeImage, analyzeText, applyCorrection, transcribeAudio,
  generateModel, analyzeRelations, analyzeFusion,
  unpackAnalysis,
} from "./aiService";
import { storagePut, storageGetSignedUrl } from "./storage";
import { validateGithubConfig } from "./githubService";
import { encryptToken, decryptToken } from "./cryptoService";
import type { AIAnalysisResult, EntryCategory } from "./aiService";

const CATEGORY_ENUM = z.enum([
  "Concept", "Person", "Case", "Question", "Insight",
  "Idea", "Skill", "Action", "Model", "Trigger", "Positioning",
]);
const PROCESSING_MODE_ENUM = z.enum(["recognize_only", "organize", "archive", "deepdive"]);
const SOURCE_TYPE_ENUM = z.enum([
  "manual_note", "screenshot", "text", "voice",
  "douyin", "xiaohongshu", "bilibili", "podcast", "article", "github", "other",
]);

function packAnalysisLocal(result: AIAnalysisResult) {
  const noteItemsJson = JSON.stringify({
    noteItems: result.noteItems || [],
    coreTheme: result.coreTheme || "",
    connectionInsight: result.connectionInsight || "",
    suggestedClusterName: result.suggestedClusterName || "",
    needsDeepDive: result.needsDeepDive || false,
    deepDiveReason: result.deepDiveReason || "",
    nextActionType: result.nextActionType || "parked",
    nextAction: result.nextAction || "",
    aiInterpretation: result.aiInterpretation || "",
    densityScore: result.densityScore ?? 5,
    densityLevel: result.densityLevel ?? "medium",
    densityReason: result.densityReason ?? "",
  });
  return {
    rawText: result.rawText || null,
    category: result.category,
    title: result.title,
    summary: result.summary,
    tags: result.tags || [],
    aiAnswer: result.aiAnswer,
    researchSuggestions: result.researchSuggestions || [],
    coreTheme: result.coreTheme || null,
    connectionInsight: result.connectionInsight || null,
    noteItemsJson,
    needsDeepDive: result.needsDeepDive ? 1 : 0,
    nextActionType: result.nextActionType || "parked",
    nextAction: result.nextAction || null,
    aiInterpretation: result.aiInterpretation || null,
    densityScore: result.densityScore ?? null,
    densityLevel: result.densityLevel ?? null,
    densityReason: result.densityReason ?? null,
  };
}

export const entriesRouter = router({
  submit: protectedProcedure
    .input(z.object({
      imageBase64: z.string().optional(),
      imageType: z.string().optional().default("image/jpeg"),
      textContent: z.string().optional(),
      processingMode: PROCESSING_MODE_ENUM.optional().default("organize"),
      sourceType: SOURCE_TYPE_ENUM.optional().default("text"),
      sourceName: z.string().optional(),
      sourceUrl: z.string().optional(),
      attentionPoint: z.string().optional(),
      batchId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      let imageUrl: string | null = null;
      let aiImageUrl: string | null = null;
      if (input.imageBase64) {
        const buffer = Buffer.from(input.imageBase64, "base64");
        const ext = input.imageType.split("/")[1] || "jpg";
        const stored = await storagePut("entries/images/entry-" + Date.now() + "." + ext, buffer, input.imageType);
        imageUrl = stored.url;
        aiImageUrl = await storageGetSignedUrl(stored.key);
      }
      const existingEntries = await db.select({ title: entries.title })
        .from(entries).where(eq(entries.userId, ctx.user.id))
        .orderBy(desc(entries.createdAt)).limit(50);
      const existingTitles = existingEntries.map((e) => e.title || "").filter(Boolean);
      const [insertResult] = await db.insert(entries).values({
        userId: ctx.user.id,
        rawText: input.textContent || null,
        imageUrl,
        status: "processing",
        category: "Idea",
        processingMode: input.processingMode,
        sourceType: input.sourceType,
        sourceName: input.sourceName || null,
        sourceUrl: input.sourceUrl || null,
        attentionPoint: input.attentionPoint || null,
        batchId: input.batchId || null,
      });
      const entryId = (insertResult as { insertId: number }).insertId;
      try {
        let result: AIAnalysisResult;
        if (aiImageUrl) {
          result = await analyzeImage(aiImageUrl, input.processingMode, existingTitles, input.attentionPoint);
        } else if (input.textContent) {
          result = await analyzeText(input.textContent, input.processingMode, existingTitles, input.attentionPoint);
        } else {
          throw new Error("No input provided");
        }
        const packed = packAnalysisLocal(result);
        const newStatus = result.needsDeepDive ? "needs_deepdive" : "pending_review";
        await db.update(entries).set({ ...packed, status: newStatus as any, isDuplicate: 0 }).where(eq(entries.id, entryId));
        if (input.processingMode !== "recognize_only") {
          const recentEntries = await db.select({
            id: entries.id, title: entries.title, summary: entries.summary,
            category: entries.category, coreTheme: entries.coreTheme,
          }).from(entries)
            .where(and(eq(entries.userId, ctx.user.id), sql`${entries.id} != ${entryId}`))
            .orderBy(desc(entries.createdAt)).limit(30);
          if (recentEntries.length > 0) {
            analyzeRelations(
              { title: result.title, summary: result.summary, category: result.category, coreTheme: result.coreTheme, tags: result.tags },
              recentEntries.map(e => ({ id: e.id, title: e.title || "", summary: e.summary || "", category: e.category, coreTheme: e.coreTheme || "" }))
            ).then(async (relations) => {
              if (relations.length > 0) {
                await db.insert(entryRelations).values(
                  relations.map(r => ({
                    userId: ctx.user.id,
                    sourceEntryId: entryId,
                    targetEntryId: r.targetEntryId,
                    relationType: r.relationType as any,
                    confidence: r.confidence,
                    reason: r.reason,
                  }))
                );
              }
            }).catch(console.error);
          }
        }
        return { entryId, status: newStatus };
      } catch (err) {
        await db.update(entries).set({ status: "pending_review" }).where(eq(entries.id, entryId));
        throw err;
      }
    }),

  transcribeVoice: protectedProcedure
    .input(z.object({ audioBase64: z.string(), mimeType: z.string().default("audio/webm") }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.audioBase64, "base64");
      const text = await transcribeAudio(buffer, input.mimeType);
      return { text };
    }),

  correct: protectedProcedure
    .input(z.object({ entryId: z.number(), instruction: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [entry] = await db.select().from(entries)
        .where(and(eq(entries.id, input.entryId), eq(entries.userId, ctx.user.id))).limit(1);
      const unpacked = unpackAnalysis(entry as any);
      const currentAnalysis: AIAnalysisResult = {
        rawText: entry.rawText || "",
        category: entry.category as EntryCategory,
        title: entry.title || "",
        summary: entry.summary || "",
        tags: (entry.tags as string[]) || [],
        aiAnswer: entry.aiAnswer || null,
        researchSuggestions: (entry.researchSuggestions as string[]) || [],
        relatedKeywords: [],
        noteItems: unpacked.noteItems || [],
        coreTheme: entry.coreTheme || "",
        connectionInsight: entry.connectionInsight || "",
        needsDeepDive: unpacked.needsDeepDive || false,
        deepDiveReason: unpacked.deepDiveReason || "",
        suggestedClusterName: unpacked.suggestedClusterName || "",
        nextActionType: unpacked.nextActionType || "parked",
        nextAction: unpacked.nextAction || entry.nextAction || "",
        aiInterpretation: unpacked.aiInterpretation || entry.aiInterpretation || "",
        densityScore: unpacked.densityScore ?? (entry.densityScore as number) ?? 5,
        densityLevel: unpacked.densityLevel ?? (entry.densityLevel as "high" | "medium" | "low") ?? "medium",
        densityReason: unpacked.densityReason ?? (entry.densityReason as string) ?? "",
      };
      const corrected = await applyCorrection(currentAnalysis, input.instruction);
      const packed = packAnalysisLocal(corrected);
      const parkKw = ["暂存", "先放着", "不处理"];
      const discardKw = ["放弃", "删掉", "不要了"];
      const deepdiveKw = ["深挖", "深入", "展开"];
      const archiveKw = ["入库", "确认", "存档"];
      let newStatus = entry.status;
      if (parkKw.some(k => input.instruction.includes(k))) newStatus = "parked";
      else if (discardKw.some(k => input.instruction.includes(k))) newStatus = "discarded";
      else if (deepdiveKw.some(k => input.instruction.includes(k))) newStatus = "needs_deepdive";
      else if (archiveKw.some(k => input.instruction.includes(k))) newStatus = "confirmed";
      await db.update(entries).set({
        ...packed, userCorrection: input.instruction,
        finalInterpretation: corrected.aiInterpretation || null,
        status: newStatus as any,
      }).where(eq(entries.id, input.entryId));
      return { success: true, updated: corrected, newStatus };
    }),

  confirm: protectedProcedure
    .input(z.object({ entryId: z.number(), clusterName: z.string().optional(), syncToGithub: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [entry] = await db.select().from(entries)
        .where(and(eq(entries.id, input.entryId), eq(entries.userId, ctx.user.id))).limit(1);
      let clusterId: number | null = null;
      if (input.clusterName) {
        const [existing] = await db.select().from(entryClusters)
          .where(and(eq(entryClusters.userId, ctx.user.id), eq(entryClusters.name, input.clusterName))).limit(1);
        if (existing) {
          clusterId = existing.id;
          const newCount = existing.entryCount + 1;
          const hasCaseEntry = existing.hasCaseEntry || (entry.category === "Case" ? 1 : 0);
          const hasUserCorrection = existing.hasUserCorrection || (entry.userCorrection ? 1 : 0);
          const upgradeable = newCount >= 3 && hasCaseEntry && hasUserCorrection;
          await db.update(entryClusters).set({ entryCount: newCount, hasCaseEntry, hasUserCorrection, status: upgradeable ? "upgradeable" : "accumulating" }).where(eq(entryClusters.id, existing.id));
        } else {
          const [ins] = await db.insert(entryClusters).values({ userId: ctx.user.id, name: input.clusterName, category: entry.category, entryCount: 1, hasCaseEntry: entry.category === "Case" ? 1 : 0, hasUserCorrection: entry.userCorrection ? 1 : 0 });
          clusterId = (ins as { insertId: number }).insertId;
        }
      }
      let githubPath: string | null = null;
      let githubSynced = 0;
      if (input.syncToGithub) {
        const [config] = await db.select().from(githubConfigs).where(eq(githubConfigs.userId, ctx.user.id)).limit(1);
        if (config?.githubTokenEncrypted && config.repoOwner && config.repoName) {
          try {
            const token = decryptToken(config.githubTokenEncrypted);
            const result = await syncEntryToGithub({ githubToken: token, repoOwner: config.repoOwner, repoName: config.repoName, branch: config.branch || "main" }, entry, input.clusterName);
            if (result.success) { githubPath = result.path; githubSynced = 1; }
          } catch (e) { console.error("GitHub sync failed:", e); }
        }
      }
      await db.update(entries).set({ status: "archived", clusterId: clusterId || undefined, githubSynced, githubPath }).where(eq(entries.id, input.entryId));
      return { success: true, githubSynced, githubPath };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ entryId: z.number(), status: z.enum(["parked", "discarded", "needs_deepdive", "confirmed", "archived", "pending_review"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(entries).set({ status: input.status as any }).where(and(eq(entries.id, input.entryId), eq(entries.userId, ctx.user.id)));
      return { success: true };
    }),

  dashboardStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
      if (!db) throw new Error("Database not available");
    const all = await db.select({ status: entries.status }).from(entries).where(eq(entries.userId, ctx.user.id));
    const clusters = await db.select({ status: entryClusters.status }).from(entryClusters).where(eq(entryClusters.userId, ctx.user.id));
    return {
      processing: all.filter((e) => e.status === "processing").length,
      pending_review: all.filter((e) => e.status === "pending_review").length,
      needs_deepdive: all.filter((e) => e.status === "needs_deepdive").length,
      archived: all.filter((e) => e.status === "archived").length,
      upgradeable: clusters.filter((c) => c.status === "upgradeable").length,
      models: clusters.filter((c) => c.status === "upgraded").length,
      parked: all.filter((e) => e.status === "parked").length,
      discarded: all.filter((e) => e.status === "discarded").length,
      total: all.length,
    };
  }),

  topNextActions: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
      if (!db) throw new Error("Database not available");
    const actionEntries = await db.select({
      id: entries.id, title: entries.title, category: entries.category,
      status: entries.status, nextActionType: entries.nextActionType,
      nextAction: entries.nextAction, densityLevel: entries.densityLevel,
      densityScore: entries.densityScore, createdAt: entries.createdAt,
    }).from(entries)
      .where(and(
        eq(entries.userId, ctx.user.id),
        sql`${entries.status} IN ('pending_review', 'confirmed', 'needs_deepdive')`,
        sql`${entries.nextActionType} IS NOT NULL AND ${entries.nextActionType} != 'parked'`,
      ))
      .orderBy(desc(entries.densityScore), desc(entries.createdAt))
      .limit(20);
    const scored = actionEntries.map(e => ({
      ...e,
      score: (e.densityScore || 5) + (e.status === "needs_deepdive" ? 3 : 0) + (e.densityLevel === "high" ? 2 : e.densityLevel === "medium" ? 1 : 0),
    })).sort((a, b) => b.score - a.score).slice(0, 3);
    return scored;
  }),

  list: protectedProcedure
    .input(z.object({
      status: z.enum(["processing","pending_review","confirmed","archived","needs_deepdive","duplicate","upgradeable","model","parked","discarded","all"]).default("all"),
      category: CATEGORY_ENUM.optional(),
      sourceType: SOURCE_TYPE_ENUM.optional(),
      limit: z.number().default(30),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const conditions = [eq(entries.userId, ctx.user.id)];
      if (input.status !== "all") conditions.push(eq(entries.status, input.status as any));
      if (input.category) conditions.push(eq(entries.category, input.category));
      if (input.sourceType) conditions.push(eq(entries.sourceType, input.sourceType));
      return db.select().from(entries).where(and(...conditions)).orderBy(desc(entries.createdAt)).limit(input.limit).offset(input.offset);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [entry] = await db.select().from(entries).where(and(eq(entries.id, input.id), eq(entries.userId, ctx.user.id))).limit(1);
      return entry;
    }),

  getRelations: protectedProcedure
    .input(z.object({ entryId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const relations = await db.select().from(entryRelations)
        .where(and(eq(entryRelations.userId, ctx.user.id), or(eq(entryRelations.sourceEntryId, input.entryId), eq(entryRelations.targetEntryId, input.entryId))))
        .orderBy(desc(entryRelations.confidence)).limit(10);
      const relatedIds = relations.map(r => r.sourceEntryId === input.entryId ? r.targetEntryId : r.sourceEntryId);
      if (relatedIds.length === 0) return [];
      const relatedEntries = await db.select({ id: entries.id, title: entries.title, category: entries.category, summary: entries.summary, status: entries.status })
        .from(entries).where(and(eq(entries.userId, ctx.user.id), inArray(entries.id, relatedIds)));
      return relations.map(r => {
        const relatedId = r.sourceEntryId === input.entryId ? r.targetEntryId : r.sourceEntryId;
        const relatedEntry = relatedEntries.find(e => e.id === relatedId);
        return { ...r, relatedEntry };
      });
    }),

  fuse: protectedProcedure
    .input(z.object({ entryAId: z.number(), entryBId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [entryA] = await db.select().from(entries).where(and(eq(entries.id, input.entryAId), eq(entries.userId, ctx.user.id))).limit(1);
      const [entryB] = await db.select().from(entries).where(and(eq(entries.id, input.entryBId), eq(entries.userId, ctx.user.id))).limit(1);
      const result = await analyzeFusion(
        { title: entryA.title || "", summary: entryA.summary || "", category: entryA.category, coreTheme: entryA.coreTheme || "", finalInterpretation: entryA.finalInterpretation },
        { title: entryB.title || "", summary: entryB.summary || "", category: entryB.category, coreTheme: entryB.coreTheme || "", finalInterpretation: entryB.finalInterpretation }
      );
      const [ins] = await db.insert(fusionResults).values({ userId: ctx.user.id, entryAId: input.entryAId, entryBId: input.entryBId, ...result });
      const fusionId = (ins as { insertId: number }).insertId;
      return { fusionId, ...result };
    }),

  getFusions: protectedProcedure
    .input(z.object({ entryId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db.select().from(fusionResults)
        .where(and(eq(fusionResults.userId, ctx.user.id), or(eq(fusionResults.entryAId, input.entryId), eq(fusionResults.entryBId, input.entryId))))
        .orderBy(desc(fusionResults.createdAt)).limit(5);
    }),

  upgradeToModel: protectedProcedure
    .input(z.object({ clusterId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [cluster] = await db.select().from(entryClusters).where(and(eq(entryClusters.id, input.clusterId), eq(entryClusters.userId, ctx.user.id))).limit(1);
      if (cluster.entryCount < 3) throw new Error("需要至少 3 条相关内容才能升级为模型");
      const clusterEntries = await db.select().from(entries).where(and(eq(entries.clusterId, input.clusterId), eq(entries.userId, ctx.user.id)));
      const { modelContent, description } = await generateModel(cluster.name, clusterEntries.map(e => ({ title: e.title || "", summary: e.summary || "", category: e.category, coreTheme: e.coreTheme || "", finalInterpretation: e.finalInterpretation })));
      let githubPath: string | null = null;
      const [config] = await db.select().from(githubConfigs).where(eq(githubConfigs.userId, ctx.user.id)).limit(1);
      if (config?.githubTokenEncrypted && config.repoOwner && config.repoName) {
        try {
          const token = decryptToken(config.githubTokenEncrypted);
          const result = await syncModelToGithub({ githubToken: token, repoOwner: config.repoOwner, repoName: config.repoName, branch: config.branch || "main" }, cluster.name, modelContent);
          if (result.success) githubPath = result.path;
        } catch (e) { console.error("GitHub model sync failed:", e); }
      }
      await db.update(entryClusters).set({ status: "upgraded", modelContent, description, githubPath }).where(eq(entryClusters.id, input.clusterId));
      return { success: true, modelContent, description, githubPath };
    }),

  listClusters: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
      if (!db) throw new Error("Database not available");
    return db.select().from(entryClusters).where(eq(entryClusters.userId, ctx.user.id)).orderBy(desc(entryClusters.updatedAt));
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(entries).where(and(eq(entries.id, input.id), eq(entries.userId, ctx.user.id)));
      return { success: true };
    }),

  saveGithubConfig: protectedProcedure
    .input(z.object({ githubToken: z.string().optional(), repoOwner: z.string(), repoName: z.string(), branch: z.string().default("main") }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [existing] = await db.select().from(githubConfigs).where(eq(githubConfigs.userId, ctx.user.id)).limit(1);
      const tokenToUse = input.githubToken || (existing?.githubTokenEncrypted ? decryptToken(existing.githubTokenEncrypted) : "");
      if (!tokenToUse) throw new Error("GitHub Token 不能为空");
      const validation = await validateGithubConfig({ githubToken: tokenToUse, repoOwner: input.repoOwner, repoName: input.repoName, branch: input.branch });
      const encryptedToken = encryptToken(tokenToUse);
      const updateData = { githubTokenEncrypted: encryptedToken, repoOwner: input.repoOwner, repoName: input.repoName, branch: input.branch };
      if (existing) { await db.update(githubConfigs).set(updateData).where(eq(githubConfigs.userId, ctx.user.id)); }
      else { await db.insert(githubConfigs).values({ userId: ctx.user.id, ...updateData }); }
      return { success: true };
    }),

  getGithubConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
      if (!db) throw new Error("Database not available");
    const [config] = await db.select({ repoOwner: githubConfigs.repoOwner, repoName: githubConfigs.repoName, branch: githubConfigs.branch, lastSyncAt: githubConfigs.lastSyncAt, hasToken: sql`${githubConfigs.githubTokenEncrypted} IS NOT NULL` }).from(githubConfigs).where(eq(githubConfigs.userId, ctx.user.id)).limit(1);
    return config || null;
  }),

  deleteGithubAuth: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
      if (!db) throw new Error("Database not available");
    await db.update(githubConfigs).set({ githubTokenEncrypted: null }).where(eq(githubConfigs.userId, ctx.user.id));
    return { success: true };
  }),

  // Get related entries by shared tags, cluster, or category
  getRelated: protectedProcedure
    .input(z.object({ id: z.number(), limit: z.number().default(5) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [entry] = await db.select().from(entries)
        .where(and(eq(entries.id, input.id), eq(entries.userId, ctx.user.id))).limit(1);
      if (!entry) return [];
      const tags = (entry.tags as string[]) || [];
      const conditions: any[] = [
        eq(entries.userId, ctx.user.id),
        sql`${entries.id} != ${input.id}`,
        eq(entries.status, "archived"),
      ];
      const orConditions: any[] = [eq(entries.category, entry.category)];
      if (entry.clusterId) orConditions.push(eq(entries.clusterId, entry.clusterId));
      if (tags.length > 0) orConditions.push(sql`JSON_OVERLAPS(${entries.tags}, ${JSON.stringify(tags)})`);
      conditions.push(or(...orConditions));
      return db.select({
        id: entries.id, title: entries.title, category: entries.category,
        densityLevel: entries.densityLevel, densityScore: entries.densityScore, status: entries.status,
      }).from(entries).where(and(...conditions))
        .orderBy(desc(entries.densityScore), desc(entries.createdAt))
        .limit(input.limit);
    }),
});

const CATEGORY_TO_FOLDER: Record<string, string> = {
  Concept: "01-concepts", Person: "02-people", Case: "03-cases",
  Question: "04-questions", Insight: "05-insights", Idea: "06-ideas",
  Skill: "07-skills", Action: "08-actions", Model: "09-models",
  Trigger: "01-concepts", Positioning: "05-insights",
};

async function syncEntryToGithub(
  config: { githubToken: string; repoOwner: string; repoName: string; branch: string },
  entry: any, clusterName?: string
): Promise<{ success: boolean; path: string; error?: string }> {
  const category = entry.category || "Idea";
  const date = new Date(entry.createdAt).toISOString().split("T")[0];
  const safeTitle = (entry.title || "entry-" + entry.id)
    .replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 50);
  const folder = CATEGORY_TO_FOLDER[category] || "01-concepts";
  const subFolder = clusterName
    ? folder + "/" + clusterName.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 40)
    : folder;
  const filePath = subFolder + "/" + date + "-" + safeTitle + ".md";
  const tags = (entry.tags as string[]) || [];
  const suggestions = (entry.researchSuggestions as string[]) || [];
  const lines: string[] = [
    "---",
    "id: " + entry.id,
    "category: " + category,
    "folder: " + folder,
    "title: \"" + (entry.title || "unnamed") + "\"",
    "tags: [" + tags.map((t: string) => "\"" + t + "\"").join(", ") + "]",
    "status: archived",
    "created: " + date,
    "source_type: " + (entry.sourceType || "text"),
    "density: " + (entry.densityLevel || "medium"),
    "---",
    "",
    "# " + (entry.title || "unnamed"),
    "",
  ];
  if (entry.attentionPoint) lines.push("## 为什么存它", "", entry.attentionPoint, "");
  lines.push("## 原始内容", "", (entry.rawText || "(图片输入)"), "");
  if (entry.summary) lines.push("## AI 提炼", "", entry.summary, "");
  if (entry.coreTheme) lines.push("## 核心命题", "", entry.coreTheme, "");
  if (entry.connectionInsight) lines.push("## 认知联系", "", entry.connectionInsight, "");
  if (entry.densityReason) lines.push("## 信息密度说明", "", entry.densityReason, "");
  if (entry.nextAction) lines.push("## 下一步", "", "**类型**：" + (entry.nextActionType || "") + "　**行动**：" + entry.nextAction, "");
  if (entry.aiInterpretation) lines.push("## AI 理解", "", entry.aiInterpretation, "");
  if (entry.userCorrection) lines.push("## 用户校正", "", entry.userCorrection, "");
  if (entry.finalInterpretation) lines.push("## 最终理解", "", entry.finalInterpretation, "");
  if (suggestions.length > 0) lines.push("## 延伸研究", "", ...suggestions.map((s: string, i: number) => (i + 1) + ". " + s), "");
  lines.push("---", "*认知处理系统 · " + date + "*");
  const md = lines.join("\n");
  return pushToGithub(config, filePath, md, "📥 入库: " + (entry.title || "entry"));
}

async function syncModelToGithub(
  config: { githubToken: string; repoOwner: string; repoName: string; branch: string },
  modelName: string, modelContent: string
): Promise<{ success: boolean; path: string; error?: string }> {
  const safeTitle = modelName.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 50);
  return pushToGithub(config, "09_Models/" + safeTitle + ".md", modelContent, "Model: " + modelName);
}

async function pushToGithub(
  config: { githubToken: string; repoOwner: string; repoName: string; branch: string },
  filePath: string, content: string, commitMessage: string
): Promise<{ success: boolean; path: string; error?: string }> {
  const apiBase = "https://api.github.com/repos/" + config.repoOwner + "/" + config.repoName + "/contents/" + filePath;
  const headers = { Authorization: "Bearer " + config.githubToken, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
  let sha: string | undefined;
  try {
    const checkRes = await fetch(apiBase + "?ref=" + config.branch, { headers });
    if (checkRes.ok) { const existing = await checkRes.json() as { sha: string }; sha = existing.sha; }
  } catch {}
  const body: Record<string, string> = { message: commitMessage, content: Buffer.from(content, "utf-8").toString("base64"), branch: config.branch };
  if (sha) body.sha = sha;
  const res = await fetch(apiBase, { method: "PUT", headers, body: JSON.stringify(body) });
  return { success: true, path: filePath };
}
