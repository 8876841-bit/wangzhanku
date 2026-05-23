import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { entries, entryClusters, githubConfigs } from "../drizzle/schema";
import { eq, desc, and, inArray, or, sql } from "drizzle-orm";
import { analyzeImage, analyzeText, applyCorrection, transcribeAudio, generateModel } from "./aiService";
import { storagePut, storageGetSignedUrl } from "./storage";
import { validateGithubConfig } from "./githubService";
import type { AIAnalysisResult, EntryCategory } from "./aiService";

const CATEGORY_ENUM = z.enum([
  "Concept", "Person", "Case", "Question", "Insight",
  "Idea", "Skill", "Action", "Model", "Trigger", "Positioning"
]);

// ── Pack analysis result into DB fields ──────────────────────────────────────
function packAnalysis(result: AIAnalysisResult) {
  const noteItemsJson = JSON.stringify({
    noteItems: result.noteItems || [],
    coreTheme: result.coreTheme || "",
    connectionInsight: result.connectionInsight || "",
    suggestedClusterName: result.suggestedClusterName || "",
    needsDeepDive: result.needsDeepDive || false,
    deepDiveReason: result.deepDiveReason || "",
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
  };
}

// ── Unpack analysis from DB ──────────────────────────────────────────────────
function unpackAnalysis(entry: { noteItemsJson: string | null; aiAnswer: string | null }) {
  try {
    if (entry.noteItemsJson) return JSON.parse(entry.noteItemsJson);
  } catch {}
  return {};
}

export const entriesRouter = router({

  // ── Submit input (image or text) → AI analysis → pending_review ──────────
  submit: protectedProcedure
    .input(z.object({
      imageBase64: z.string().optional(),
      imageType: z.string().optional().default("image/jpeg"),
      textContent: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let imageUrl: string | null = null;
      let aiImageUrl: string | null = null;

      if (input.imageBase64) {
        const buffer = Buffer.from(input.imageBase64, "base64");
        const ext = input.imageType.split("/")[1] || "jpg";
        const stored = await storagePut(`entries/images/entry-${Date.now()}.${ext}`, buffer, input.imageType);
        imageUrl = stored.url;
        aiImageUrl = await storageGetSignedUrl(stored.key);
      }

      // Get existing titles for duplicate detection context
      const existingEntries = await db.select({ title: entries.title })
        .from(entries).where(eq(entries.userId, ctx.user.id))
        .orderBy(desc(entries.createdAt)).limit(50);
      const existingTitles = existingEntries.map((e) => e.title || "").filter(Boolean);

      // Create placeholder
      const [insertResult] = await db.insert(entries).values({
        userId: ctx.user.id,
        rawText: input.textContent || null,
        imageUrl,
        status: "processing",
        category: "Idea",
      });
      const entryId = (insertResult as { insertId: number }).insertId;

      try {
        let result: AIAnalysisResult;
        if (aiImageUrl) {
          result = await analyzeImage(aiImageUrl, existingTitles);
        } else if (input.textContent) {
          result = await analyzeText(input.textContent, existingTitles);
        } else {
          throw new Error("Either image or text content is required");
        }

        const packed = packAnalysis(result);
        const status = result.needsDeepDive ? "needs_deepdive" : "pending_review";

        await db.update(entries).set({
          ...packed,
          status,
        }).where(eq(entries.id, entryId));

        const [updated] = await db.select().from(entries).where(eq(entries.id, entryId)).limit(1);
        return { success: true, entry: updated, analysisResult: result };
      } catch (error) {
        await db.update(entries).set({ status: "pending_review" }).where(eq(entries.id, entryId));
        throw error;
      }
    }),

  // ── Transcribe voice ──────────────────────────────────────────────────────
  transcribeVoice: protectedProcedure
    .input(z.object({ audioBase64: z.string(), mimeType: z.string().default("audio/webm") }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.audioBase64, "base64");
      const text = await transcribeAudio(buffer, input.mimeType);
      return { text };
    }),

  // ── Apply correction ──────────────────────────────────────────────────────
  applyCorrection: protectedProcedure
    .input(z.object({ entryId: z.number(), instruction: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [entry] = await db.select().from(entries)
        .where(and(eq(entries.id, input.entryId), eq(entries.userId, ctx.user.id))).limit(1);
      if (!entry) throw new Error("Entry not found");

      const unpacked = unpackAnalysis(entry as any);
      const currentAnalysis: AIAnalysisResult = {
        rawText: entry.rawText || "",
        category: entry.category as EntryCategory,
        title: entry.title || "",
        summary: entry.summary || "",
        tags: (entry.tags as string[]) || [],
        aiAnswer: entry.aiAnswer,
        researchSuggestions: (entry.researchSuggestions as string[]) || [],
        relatedKeywords: [],
        noteItems: unpacked.noteItems || [],
        coreTheme: entry.coreTheme || "",
        connectionInsight: entry.connectionInsight || "",
        needsDeepDive: unpacked.needsDeepDive || false,
        deepDiveReason: unpacked.deepDiveReason || "",
        suggestedClusterName: unpacked.suggestedClusterName || "",
      };

      const updated = await applyCorrection(currentAnalysis, input.instruction);
      const packed = packAnalysis(updated);

      await db.update(entries).set({
        ...packed,
        userCorrection: input.instruction,
      }).where(eq(entries.id, input.entryId));

      const [updatedEntry] = await db.select().from(entries).where(eq(entries.id, input.entryId)).limit(1);
      return { success: true, entry: updatedEntry, analysisResult: updated };
    }),

  // ── Confirm entry → archived + GitHub sync ────────────────────────────────
  confirm: protectedProcedure
    .input(z.object({
      entryId: z.number(),
      clusterName: z.string().optional(),
      syncToGithub: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [entry] = await db.select().from(entries)
        .where(and(eq(entries.id, input.entryId), eq(entries.userId, ctx.user.id))).limit(1);
      if (!entry) throw new Error("Entry not found");

      // Handle cluster assignment
      let clusterId: number | null = null;
      if (input.clusterName) {
        const [existing] = await db.select().from(entryClusters)
          .where(and(eq(entryClusters.userId, ctx.user.id), eq(entryClusters.name, input.clusterName))).limit(1);

        if (existing) {
          clusterId = existing.id;
          const newCount = existing.entryCount + 1;
          await db.update(entryClusters).set({
            entryCount: newCount,
            status: newCount >= 3 ? "upgradeable" : "accumulating",
          }).where(eq(entryClusters.id, existing.id));
        } else {
          const [ins] = await db.insert(entryClusters).values({
            userId: ctx.user.id,
            name: input.clusterName,
            category: entry.category,
            entryCount: 1,
          });
          clusterId = (ins as { insertId: number }).insertId;
        }
      }

      // Sync to GitHub if configured
      let githubPath: string | null = null;
      let githubSynced = 0;

      if (input.syncToGithub) {
        const [config] = await db.select().from(githubConfigs)
          .where(eq(githubConfigs.userId, ctx.user.id)).limit(1);

        if (config?.githubToken && config.repoOwner && config.repoName) {
          try {
            const result = await syncEntryToGithub(
              { githubToken: config.githubToken, repoOwner: config.repoOwner, repoName: config.repoName, branch: config.branch || "main" },
              entry, input.clusterName
            );
            if (result.success) {
              githubPath = result.path;
              githubSynced = 1;
            }
          } catch (e) {
            console.error("GitHub sync failed:", e);
          }
        }
      }

      await db.update(entries).set({
        status: "archived",
        clusterId: clusterId || undefined,
        githubSynced,
        githubPath,
      }).where(eq(entries.id, input.entryId));

      return { success: true, githubSynced: !!githubSynced, githubPath };
    }),

  // ── Dashboard stats ───────────────────────────────────────────────────────
  dashboardStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const all = await db.select({ status: entries.status, needsDeepDive: entries.needsDeepDive })
      .from(entries).where(eq(entries.userId, ctx.user.id));

    const clusters = await db.select({ status: entryClusters.status })
      .from(entryClusters).where(eq(entryClusters.userId, ctx.user.id));

    return {
      processing: all.filter((e) => e.status === "processing").length,
      pending_review: all.filter((e) => e.status === "pending_review").length,
      needs_deepdive: all.filter((e) => e.status === "needs_deepdive").length,
      archived: all.filter((e) => e.status === "archived").length,
      upgradeable: clusters.filter((c) => c.status === "upgradeable").length,
      duplicate: all.filter((e) => e.status === "duplicate").length,
      models: clusters.filter((c) => c.status === "upgraded").length,
      total: all.length,
    };
  }),

  // ── List entries by status ────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["processing", "pending_review", "confirmed", "archived", "needs_deepdive", "duplicate", "upgradeable", "model", "all"]).default("all"),
      category: CATEGORY_ENUM.optional(),
      limit: z.number().default(30),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(entries.userId, ctx.user.id)];
      if (input.status !== "all") conditions.push(eq(entries.status, input.status as any));
      if (input.category) conditions.push(eq(entries.category, input.category));

      return db.select().from(entries)
        .where(and(...conditions))
        .orderBy(desc(entries.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // ── Get single entry ──────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [entry] = await db.select().from(entries)
        .where(and(eq(entries.id, input.id), eq(entries.userId, ctx.user.id))).limit(1);
      if (!entry) throw new Error("Entry not found");

      let cluster = null;
      if ((entry as any).clusterId) {
        const [c] = await db.select().from(entryClusters).where(eq(entryClusters.id, (entry as any).clusterId)).limit(1);
        cluster = c || null;
      }

      return { entry, cluster };
    }),

  // ── Delete entry ──────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(entries).where(and(eq(entries.id, input.id), eq(entries.userId, ctx.user.id)));
      return { success: true };
    }),

  // ── List clusters ─────────────────────────────────────────────────────────
  listClusters: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db.select().from(entryClusters)
      .where(eq(entryClusters.userId, ctx.user.id))
      .orderBy(desc(entryClusters.entryCount));
  }),

  // ── Upgrade cluster to Model ──────────────────────────────────────────────
  upgradeToModel: protectedProcedure
    .input(z.object({ clusterId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [cluster] = await db.select().from(entryClusters)
        .where(and(eq(entryClusters.id, input.clusterId), eq(entryClusters.userId, ctx.user.id))).limit(1);
      if (!cluster) throw new Error("Cluster not found");

      // Get all entries in this cluster
      const clusterEntries = await db.select({
        title: entries.title, summary: entries.summary,
        category: entries.category, coreTheme: entries.coreTheme,
      }).from(entries).where(eq((entries as any).clusterId, input.clusterId));

      if (clusterEntries.length === 0) throw new Error("No entries in cluster");

      // Generate model
      const { modelContent, description } = await generateModel(
        cluster.name,
        clusterEntries.map((e) => ({
          title: e.title || "",
          summary: e.summary || "",
          category: e.category,
          coreTheme: e.coreTheme || "",
        }))
      );

      // Sync to GitHub if configured
      let githubPath: string | null = null;
      const [config] = await db.select().from(githubConfigs)
        .where(eq(githubConfigs.userId, ctx.user.id)).limit(1);

      if (config?.githubToken && config.repoOwner && config.repoName) {
        try {
          const result = await syncModelToGithub(
            { githubToken: config.githubToken, repoOwner: config.repoOwner, repoName: config.repoName, branch: config.branch || "main" },
            cluster.name, modelContent
          );
          if (result.success) githubPath = result.path;
        } catch (e) {
          console.error("GitHub model sync failed:", e);
        }
      }

      await db.update(entryClusters).set({
        modelContent,
        description,
        status: "upgraded",
        githubPath,
      }).where(eq(entryClusters.id, input.clusterId));

      // Mark all entries in cluster as "model"
      await db.update(entries).set({ status: "model" })
        .where(eq((entries as any).clusterId, input.clusterId));

      return { success: true, modelContent, description };
    }),

  // ── GitHub config ─────────────────────────────────────────────────────────
  getGithubConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const [config] = await db.select({
      id: githubConfigs.id, repoOwner: githubConfigs.repoOwner,
      repoName: githubConfigs.repoName, branch: githubConfigs.branch,
      lastSyncAt: githubConfigs.lastSyncAt, hasToken: githubConfigs.githubToken,
    }).from(githubConfigs).where(eq(githubConfigs.userId, ctx.user.id)).limit(1);
    if (!config) return null;
    return { ...config, hasToken: !!config.hasToken };
  }),

  saveGithubConfig: protectedProcedure
    .input(z.object({
      githubToken: z.string().optional(),
      repoOwner: z.string().min(1),
      repoName: z.string().min(1),
      branch: z.string().default("main"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [existing] = await db.select().from(githubConfigs)
        .where(eq(githubConfigs.userId, ctx.user.id)).limit(1);
      const tokenToUse = input.githubToken || existing?.githubToken;
      if (!tokenToUse) throw new Error("请提供 GitHub Token");
      const validation = await validateGithubConfig({ githubToken: tokenToUse, repoOwner: input.repoOwner, repoName: input.repoName, branch: input.branch });
      if (!validation.valid) throw new Error(validation.error);
      const updateData = { githubToken: tokenToUse, repoOwner: input.repoOwner, repoName: input.repoName, branch: input.branch };
      if (existing) {
        await db.update(githubConfigs).set(updateData).where(eq(githubConfigs.userId, ctx.user.id));
      } else {
        await db.insert(githubConfigs).values({ userId: ctx.user.id, ...updateData });
      }
      return { success: true };
    }),
});

// ── GitHub sync helpers ──────────────────────────────────────────────────────
async function syncEntryToGithub(
  config: { githubToken: string; repoOwner: string; repoName: string; branch: string },
  entry: any,
  clusterName?: string
): Promise<{ success: boolean; path: string; error?: string }> {
  const category = entry.category || "Idea";
  const date = new Date(entry.createdAt).toISOString().split("T")[0];
  const safeTitle = (entry.title || `entry-${entry.id}`)
    .replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 50);

  const folder = clusterName
    ? `Clusters/${clusterName.replace(/[/\\:*?"<>|]/g, "-")}`
    : category;
  const filePath = `${folder}/${date}-${safeTitle}.md`;

  const tags = (entry.tags as string[]) || [];
  const suggestions = (entry.researchSuggestions as string[]) || [];
  let md = `---
id: ${entry.id}
category: ${category}
title: "${entry.title || "未命名"}"
tags: [${tags.map((t: string) => `"${t}"`).join(", ")}]
status: archived
created: ${date}
${clusterName ? `cluster: "${clusterName}"` : ""}
---

# ${entry.title || "未命名"}

> **分类**：${category}${tags.length > 0 ? `　**标签**：${tags.join(" · ")}` : ""}

## 原始记录

${entry.rawText || "（图片输入）"}
`;

  if (entry.imageUrl) md += `\n## 原始图片\n\n![](${entry.imageUrl})\n`;
  if (entry.summary) md += `\n## AI 提炼\n\n${entry.summary}\n`;
  if (entry.coreTheme) md += `\n## 核心命题\n\n${entry.coreTheme}\n`;
  if (entry.aiAnswer) {
    const ans = entry.aiAnswer.includes("__ITEMS__")
      ? entry.aiAnswer.split("__ITEMS__")[0].trim()
      : entry.aiAnswer;
    if (ans) md += `\n## AI 回答\n\n${ans}\n`;
  }
  if (suggestions.length > 0) {
    md += `\n## 延伸研究方向\n\n${suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}\n`;
  }
  if (entry.userCorrection) md += `\n## 用户校正\n\n${entry.userCorrection}\n`;
  md += `\n---\n*认知处理系统 · ${new Date().toLocaleString("zh-CN")}*\n`;

  return pushToGithub(config, filePath, md, `📥 入库: ${entry.title || "未命名"}`);
}

async function syncModelToGithub(
  config: { githubToken: string; repoOwner: string; repoName: string; branch: string },
  modelName: string,
  modelContent: string
): Promise<{ success: boolean; path: string; error?: string }> {
  const safeTitle = modelName.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 50);
  const filePath = `Model/${safeTitle}.md`;
  return pushToGithub(config, filePath, modelContent, `🧠 认知模型: ${modelName}`);
}

async function pushToGithub(
  config: { githubToken: string; repoOwner: string; repoName: string; branch: string },
  filePath: string,
  content: string,
  commitMessage: string
): Promise<{ success: boolean; path: string; error?: string }> {
  const apiBase = `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${config.githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  let sha: string | undefined;
  try {
    const checkRes = await fetch(`${apiBase}?ref=${config.branch}`, { headers });
    if (checkRes.ok) {
      const existing = await checkRes.json() as { sha: string };
      sha = existing.sha;
    }
  } catch {}

  const body: Record<string, string> = {
    message: commitMessage,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch: config.branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiBase, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const errText = await res.text();
    return { success: false, path: filePath, error: `GitHub API error: ${res.status} ${errText}` };
  }
  return { success: true, path: filePath };
}
