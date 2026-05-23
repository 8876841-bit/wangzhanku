import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { notes, noteRelations, githubConfigs, topics } from "../drizzle/schema";
import { eq, desc, and, or, inArray } from "drizzle-orm";
import {
  analyzeNoteImage,
  analyzeNoteText,
  findRelatedNotes,
  transcribeAudio,
  applyCalibrationInstruction,
  type AIAnalysisResult,
} from "./aiService";
import { storagePut, storageGetSignedUrl } from "./storage";
import { syncNoteToGithub, validateGithubConfig } from "./githubService";
import type { NoteCategory } from "./aiService";

// Helper: pack analysis result into DB fields
function packAnalysis(result: AIAnalysisResult) {
  const noteItemsJson = JSON.stringify({
    noteItems: result.noteItems || [],
    coreTheme: result.coreTheme || "",
    connectionInsight: result.connectionInsight || "",
    suggestedTopicName: result.suggestedTopicName || "",
    suggestedTopicReason: result.suggestedTopicReason || "",
  });
  const combinedAiAnswer = result.aiAnswer
    ? `${result.aiAnswer}\n\n__ITEMS__${noteItemsJson}`
    : `__ITEMS__${noteItemsJson}`;
  return {
    rawText: result.rawText || null,
    category: result.category as NoteCategory,
    title: result.title,
    summary: result.summary,
    tags: result.tags,
    aiAnswer: combinedAiAnswer,
    researchSuggestions: result.researchSuggestions,
    coreTheme: result.coreTheme || null,
    connectionInsight: result.connectionInsight || null,
    noteItemsJson,
  };
}

// Helper: unpack analysis from DB fields
function unpackAnalysis(note: { aiAnswer: string | null; noteItemsJson: string | null }): Partial<AIAnalysisResult> {
  try {
    const raw = note.noteItemsJson || "";
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed;
    }
    // fallback: parse from aiAnswer
    const rawAiAnswer = note.aiAnswer || "";
    const markerIdx = rawAiAnswer.indexOf("__ITEMS__");
    if (markerIdx !== -1) {
      return JSON.parse(rawAiAnswer.slice(markerIdx + 9));
    }
  } catch {}
  return {};
}

export const notesRouter = router({
  // ── Upload image/text and run AI pipeline → returns draft for calibration ──
  uploadAndAnalyze: protectedProcedure
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
        const stored = await storagePut(`notes/images/note-${Date.now()}.${ext}`, buffer, input.imageType);
        imageUrl = stored.url;
        aiImageUrl = await storageGetSignedUrl(stored.key);
      }

      // Get existing topic names for AI context
      const existingTopics = await db.select({ name: topics.name })
        .from(topics).where(eq(topics.userId, ctx.user.id));
      const topicNames = existingTopics.map((t) => t.name);

      // Create placeholder note with "processing" status
      const [insertResult] = await db.insert(notes).values({
        userId: ctx.user.id,
        rawText: input.textContent || null,
        imageUrl,
        status: "processing",
        category: "other",
      });
      const noteId = (insertResult as { insertId: number }).insertId;

      try {
        let analysisResult: AIAnalysisResult;
        if (aiImageUrl) {
          analysisResult = await analyzeNoteImage(aiImageUrl, topicNames);
        } else if (input.textContent) {
          analysisResult = await analyzeNoteText(input.textContent, topicNames);
        } else {
          throw new Error("Either image or text content is required");
        }

        // Save as DRAFT (not done) — user must calibrate and confirm
        const packed = packAnalysis(analysisResult);
        await db.update(notes).set({
          ...packed,
          status: "draft",
        }).where(eq(notes.id, noteId));

        // Background: find related notes
        findAndLinkRelatedNotes(ctx.user.id, noteId, analysisResult, db).catch(console.error);

        const [updatedNote] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
        return { success: true, note: updatedNote, analysisResult };
      } catch (error) {
        await db.update(notes).set({ status: "error" }).where(eq(notes.id, noteId));
        throw error;
      }
    }),

  // ── Transcribe voice audio via Whisper API ──
  transcribeVoice: protectedProcedure
    .input(z.object({
      audioBase64: z.string(),
      mimeType: z.string().default("audio/webm"),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.audioBase64, "base64");
      const text = await transcribeAudio(buffer, input.mimeType);
      return { text };
    }),

  // ── Apply calibration instruction to a draft note ──
  applyCalibration: protectedProcedure
    .input(z.object({
      noteId: z.number(),
      instruction: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [note] = await db.select().from(notes)
        .where(and(eq(notes.id, input.noteId), eq(notes.userId, ctx.user.id)))
        .limit(1);
      if (!note) throw new Error("Note not found");

      // Reconstruct current analysis from DB
      const unpacked = unpackAnalysis(note as any);
      const currentAnalysis: AIAnalysisResult = {
        rawText: note.rawText || "",
        category: note.category as NoteCategory,
        title: note.title || "",
        summary: note.summary || "",
        tags: (note.tags as string[]) || [],
        aiAnswer: null,
        researchSuggestions: (note.researchSuggestions as string[]) || [],
        relatedKeywords: [],
        noteItems: unpacked.noteItems || [],
        coreTheme: note.coreTheme || "",
        connectionInsight: note.connectionInsight || "",
        suggestedTopicName: unpacked.suggestedTopicName || "",
        suggestedTopicReason: unpacked.suggestedTopicReason || "",
      };

      // Apply instruction via AI
      const updated = await applyCalibrationInstruction(currentAnalysis, input.instruction);

      // Save updated analysis back to DB (still draft)
      const packed = packAnalysis(updated);
      await db.update(notes).set({ ...packed, status: "draft" }).where(eq(notes.id, input.noteId));

      const [updatedNote] = await db.select().from(notes).where(eq(notes.id, input.noteId)).limit(1);
      return { success: true, note: updatedNote, analysisResult: updated };
    }),

  // ── Confirm draft → mark as done, optionally assign topic ──
  confirmDraft: protectedProcedure
    .input(z.object({
      noteId: z.number(),
      topicName: z.string().optional(),  // confirmed topic name
      createNewTopic: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let topicId: number | null = null;

      if (input.topicName) {
        // Find or create topic
        const [existing] = await db.select().from(topics)
          .where(and(eq(topics.userId, ctx.user.id), eq(topics.name, input.topicName)))
          .limit(1);

        if (existing) {
          topicId = existing.id;
          await db.update(topics).set({ noteCount: existing.noteCount + 1 })
            .where(eq(topics.id, existing.id));
        } else {
          const [insertResult] = await db.insert(topics).values({
            userId: ctx.user.id,
            name: input.topicName,
            noteCount: 1,
            githubFolder: input.topicName.replace(/[/\\:*?"<>|]/g, "-"),
          });
          topicId = (insertResult as { insertId: number }).insertId;
        }
      }

      await db.update(notes).set({
        status: "done",
        topicId: topicId || undefined,
      }).where(and(eq(notes.id, input.noteId), eq(notes.userId, ctx.user.id)));

      return { success: true, topicId };
    }),

  // ── List notes ──
  list: protectedProcedure
    .input(z.object({
      category: z.enum(["idea", "question", "person", "skill", "todo", "experience", "quote", "other"]).optional(),
      topicId: z.number().optional(),
      search: z.string().optional(),
      status: z.enum(["draft", "done", "all"]).default("done"),
      limit: z.number().default(20),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(notes.userId, ctx.user.id)];
      if (input.category) conditions.push(eq(notes.category, input.category));
      if (input.topicId) conditions.push(eq((notes as any).topicId, input.topicId));
      if (input.status !== "all") conditions.push(eq(notes.status, input.status as any));

      const allNotes = await db.select().from(notes)
        .where(and(...conditions))
        .orderBy(desc(notes.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      if (input.search) {
        const q = input.search.toLowerCase();
        return allNotes.filter((n) =>
          n.title?.toLowerCase().includes(q) ||
          n.rawText?.toLowerCase().includes(q) ||
          n.summary?.toLowerCase().includes(q)
        );
      }
      return allNotes;
    }),

  // ── Get single note with relations ──
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [note] = await db.select().from(notes)
        .where(and(eq(notes.id, input.id), eq(notes.userId, ctx.user.id)))
        .limit(1);
      if (!note) throw new Error("Note not found");

      const relations = await db.select().from(noteRelations)
        .where(or(eq(noteRelations.sourceNoteId, input.id), eq(noteRelations.targetNoteId, input.id)));

      const relatedIds = relations.map((r) =>
        r.sourceNoteId === input.id ? r.targetNoteId : r.sourceNoteId
      );

      let relatedNotes: typeof notes.$inferSelect[] = [];
      if (relatedIds.length > 0) {
        relatedNotes = await db.select().from(notes)
          .where(and(inArray(notes.id, relatedIds), eq(notes.userId, ctx.user.id)));
      }

      // Get topic if linked
      let topic = null;
      if ((note as any).topicId) {
        const [t] = await db.select().from(topics).where(eq(topics.id, (note as any).topicId)).limit(1);
        topic = t || null;
      }

      return { note, relations, relatedNotes, topic };
    }),

  // ── Delete note ──
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(noteRelations).where(
        or(eq(noteRelations.sourceNoteId, input.id), eq(noteRelations.targetNoteId, input.id))
      );
      await db.delete(notes).where(and(eq(notes.id, input.id), eq(notes.userId, ctx.user.id)));
      return { success: true };
    }),

  // ── Stats ──
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const allNotes = await db.select({ category: notes.category, githubSynced: notes.githubSynced, status: notes.status })
      .from(notes).where(eq(notes.userId, ctx.user.id));
    const total = allNotes.filter((n) => n.status === "done").length;
    const draftCount = allNotes.filter((n) => n.status === "draft").length;
    const byCategory: Record<string, number> = {};
    let syncedCount = 0;
    for (const n of allNotes) {
      if (n.status === "done") {
        byCategory[n.category] = (byCategory[n.category] || 0) + 1;
        if (n.githubSynced) syncedCount++;
      }
    }
    return { total, draftCount, byCategory, syncedCount };
  }),

  // ── Topics CRUD ──
  listTopics: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db.select().from(topics).where(eq(topics.userId, ctx.user.id)).orderBy(desc(topics.noteCount));
  }),

  // ── Sync note to GitHub ──
  syncToGithub: protectedProcedure
    .input(z.object({ noteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [config] = await db.select().from(githubConfigs)
        .where(eq(githubConfigs.userId, ctx.user.id)).limit(1);
      if (!config?.githubToken || !config.repoOwner || !config.repoName) {
        throw new Error("GitHub 配置未完成，请先在设置中配置 GitHub 信息");
      }
      const [note] = await db.select().from(notes)
        .where(and(eq(notes.id, input.noteId), eq(notes.userId, ctx.user.id))).limit(1);
      if (!note) throw new Error("Note not found");

      // Get topic for folder structure
      let topicFolder: string | undefined;
      if ((note as any).topicId) {
        const [t] = await db.select().from(topics).where(eq(topics.id, (note as any).topicId)).limit(1);
        topicFolder = t?.githubFolder || undefined;
      }

      const result = await syncNoteToGithub(
        { githubToken: config.githubToken, repoOwner: config.repoOwner, repoName: config.repoName, branch: config.branch || "main" },
        { ...note, tags: (note.tags as string[]) || [], researchSuggestions: (note.researchSuggestions as string[]) || [], topicFolder }
      );
      if (result.success) {
        await db.update(notes).set({ githubSynced: 1, githubPath: result.path }).where(eq(notes.id, input.noteId));
      }
      return result;
    }),

  // ── Sync all to GitHub ──
  syncAllToGithub: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [config] = await db.select().from(githubConfigs)
      .where(eq(githubConfigs.userId, ctx.user.id)).limit(1);
    if (!config?.githubToken || !config.repoOwner || !config.repoName) throw new Error("GitHub 配置未完成");
    const unsyncedNotes = await db.select().from(notes)
      .where(and(eq(notes.userId, ctx.user.id), eq(notes.githubSynced, 0), eq(notes.status, "done")));
    let successCount = 0, failCount = 0;
    for (const note of unsyncedNotes) {
      let topicFolder: string | undefined;
      if ((note as any).topicId) {
        const [t] = await db.select().from(topics).where(eq(topics.id, (note as any).topicId)).limit(1);
        topicFolder = t?.githubFolder || undefined;
      }
      const result = await syncNoteToGithub(
        { githubToken: config.githubToken, repoOwner: config.repoOwner, repoName: config.repoName, branch: config.branch || "main" },
        { ...note, tags: (note.tags as string[]) || [], researchSuggestions: (note.researchSuggestions as string[]) || [], topicFolder }
      );
      if (result.success) {
        await db.update(notes).set({ githubSynced: 1, githubPath: result.path }).where(eq(notes.id, note.id));
        successCount++;
      } else failCount++;
    }
    await db.update(githubConfigs).set({ lastSyncAt: new Date() }).where(eq(githubConfigs.userId, ctx.user.id));
    return { successCount, failCount, total: unsyncedNotes.length };
  }),

  // ── GitHub config ──
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

  // ── Graph ──
  getGraph: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const allNotes = await db.select({ id: notes.id, title: notes.title, category: notes.category, tags: notes.tags })
      .from(notes).where(and(eq(notes.userId, ctx.user.id), eq(notes.status, "done")));
    const allRelations = await db.select().from(noteRelations);
    const noteIds = new Set(allNotes.map((n) => n.id));
    const userRelations = allRelations.filter((r) => noteIds.has(r.sourceNoteId) && noteIds.has(r.targetNoteId));
    return { nodes: allNotes, edges: userRelations };
  }),
});

// Helper: find and link related notes in background
async function findAndLinkRelatedNotes(
  userId: number,
  newNoteId: number,
  analysisResult: { title: string; tags: string[]; summary: string },
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
) {
  const recentNotes = await db.select({ id: notes.id, title: notes.title, tags: notes.tags, summary: notes.summary })
    .from(notes).where(and(eq(notes.userId, userId), eq(notes.status, "done")))
    .orderBy(desc(notes.createdAt)).limit(30);
  const candidates = recentNotes
    .filter((n) => n.id !== newNoteId && n.title && n.summary)
    .map((n) => ({ id: n.id, title: n.title!, tags: (n.tags as string[]) || [], summary: n.summary! }));
  if (candidates.length === 0) return;
  const relations = await findRelatedNotes(
    { title: analysisResult.title, tags: analysisResult.tags, summary: analysisResult.summary },
    candidates
  );
  for (const rel of relations) {
    await db.insert(noteRelations).values({
      sourceNoteId: newNoteId, targetNoteId: rel.noteId,
      relationType: rel.relationType, description: rel.description,
    }).catch(() => {});
  }
}
