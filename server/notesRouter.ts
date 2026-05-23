import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { notes, noteRelations, githubConfigs } from "../drizzle/schema";
import { eq, desc, and, or, like, inArray } from "drizzle-orm";
import { analyzeNoteImage, analyzeNoteText, findRelatedNotes } from "./aiService";
import { storagePut, storageGetSignedUrl } from "./storage";
import { syncNoteToGithub, validateGithubConfig } from "./githubService";
import type { NoteCategory } from "./aiService";

export const notesRouter = router({
  // Upload image and analyze
  uploadAndAnalyze: protectedProcedure
    .input(
      z.object({
        imageBase64: z.string().optional(),
        imageType: z.string().optional().default("image/jpeg"),
        textContent: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let imageUrl: string | null = null;
      let analysisResult;

      // Upload image to S3 if provided
      let aiImageUrl: string | null = null; // publicly accessible URL for OpenAI
      if (input.imageBase64) {
        const buffer = Buffer.from(input.imageBase64, "base64");
        const ext = input.imageType.split("/")[1] || "jpg";
        const stored = await storagePut(`notes/images/note-${Date.now()}.${ext}`, buffer, input.imageType);
        imageUrl = stored.url; // internal /manus-storage/... path for display
        // Get a publicly accessible signed URL for OpenAI to download
        aiImageUrl = await storageGetSignedUrl(stored.key);
      }

      // Create a placeholder note with "processing" status
      const [insertResult] = await db.insert(notes).values({
        userId: ctx.user.id,
        rawText: input.textContent || null,
        imageUrl,
        status: "processing",
        category: "other",
      });
      const noteId = (insertResult as { insertId: number }).insertId;

      try {
        // Run AI analysis
        if (aiImageUrl) {
          analysisResult = await analyzeNoteImage(aiImageUrl);
        } else if (input.textContent) {
          analysisResult = await analyzeNoteText(input.textContent);
        } else {
          throw new Error("Either image or text content is required");
        }

        // Store noteItems, coreTheme, connectionInsight as JSON in aiAnswer field
        // Format: if aiAnswer exists, store as JSON object with both fields
        const noteItemsJson = JSON.stringify({
          noteItems: analysisResult.noteItems || [],
          coreTheme: analysisResult.coreTheme || "",
          connectionInsight: analysisResult.connectionInsight || "",
        });
        // Combine aiAnswer text + noteItemsJson in a structured way
        const combinedAiAnswer = analysisResult.aiAnswer
          ? `${analysisResult.aiAnswer}\n\n__ITEMS__${noteItemsJson}`
          : `__ITEMS__${noteItemsJson}`;

        // Update note with analysis results
        await db.update(notes).set({
          rawText: analysisResult.rawText || input.textContent || null,
          category: analysisResult.category as NoteCategory,
          title: analysisResult.title,
          summary: analysisResult.summary,
          tags: analysisResult.tags,
          aiAnswer: combinedAiAnswer,
          researchSuggestions: analysisResult.researchSuggestions,
          status: "done",
        }).where(eq(notes.id, noteId));

        // Find related notes in background (don't await)
        findAndLinkRelatedNotes(ctx.user.id, noteId, analysisResult, db).catch(console.error);

        const [updatedNote] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
        return { success: true, note: updatedNote };
      } catch (error) {
        await db.update(notes).set({ status: "error" }).where(eq(notes.id, noteId));
        throw error;
      }
    }),

  // List notes with optional category filter
  list: protectedProcedure
    .input(
      z.object({
        category: z.enum(["idea", "question", "person", "skill", "todo", "experience", "quote", "other"]).optional(),
        search: z.string().optional(),
        limit: z.number().default(20),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(notes.userId, ctx.user.id)];
      if (input.category) conditions.push(eq(notes.category, input.category));

      const allNotes = await db
        .select()
        .from(notes)
        .where(and(...conditions))
        .orderBy(desc(notes.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      // Filter by search if provided (client-side for simplicity)
      if (input.search) {
        const q = input.search.toLowerCase();
        return allNotes.filter(
          (n) =>
            n.title?.toLowerCase().includes(q) ||
            n.rawText?.toLowerCase().includes(q) ||
            n.summary?.toLowerCase().includes(q)
        );
      }

      return allNotes;
    }),

  // Get single note with relations
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [note] = await db
        .select()
        .from(notes)
        .where(and(eq(notes.id, input.id), eq(notes.userId, ctx.user.id)))
        .limit(1);

      if (!note) throw new Error("Note not found");

      // Get relations
      const relations = await db
        .select()
        .from(noteRelations)
        .where(
          or(
            eq(noteRelations.sourceNoteId, input.id),
            eq(noteRelations.targetNoteId, input.id)
          )
        );

      // Get related note details
      const relatedIds = relations.map((r) =>
        r.sourceNoteId === input.id ? r.targetNoteId : r.sourceNoteId
      );

      let relatedNotes: typeof notes.$inferSelect[] = [];
      if (relatedIds.length > 0) {
        relatedNotes = await db
          .select()
          .from(notes)
          .where(and(inArray(notes.id, relatedIds), eq(notes.userId, ctx.user.id)));
      }

      return { note, relations, relatedNotes };
    }),

  // Delete a note
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(noteRelations).where(
        or(
          eq(noteRelations.sourceNoteId, input.id),
          eq(noteRelations.targetNoteId, input.id)
        )
      );
      await db.delete(notes).where(and(eq(notes.id, input.id), eq(notes.userId, ctx.user.id)));
      return { success: true };
    }),

  // Get stats
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const allNotes = await db
      .select({ category: notes.category, githubSynced: notes.githubSynced })
      .from(notes)
      .where(eq(notes.userId, ctx.user.id));

    const total = allNotes.length;
    const byCategory: Record<string, number> = {};
    let syncedCount = 0;

    for (const n of allNotes) {
      byCategory[n.category] = (byCategory[n.category] || 0) + 1;
      if (n.githubSynced) syncedCount++;
    }

    return { total, byCategory, syncedCount };
  }),

  // Sync note to GitHub
  syncToGithub: protectedProcedure
    .input(z.object({ noteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get GitHub config
      const [config] = await db
        .select()
        .from(githubConfigs)
        .where(eq(githubConfigs.userId, ctx.user.id))
        .limit(1);

      if (!config || !config.githubToken || !config.repoOwner || !config.repoName) {
        throw new Error("GitHub 配置未完成，请先在设置中配置 GitHub 信息");
      }

      // Get note
      const [note] = await db
        .select()
        .from(notes)
        .where(and(eq(notes.id, input.noteId), eq(notes.userId, ctx.user.id)))
        .limit(1);

      if (!note) throw new Error("Note not found");

      const result = await syncNoteToGithub(
        {
          githubToken: config.githubToken,
          repoOwner: config.repoOwner,
          repoName: config.repoName,
          branch: config.branch || "main",
        },
        {
          ...note,
          tags: (note.tags as string[]) || [],
          researchSuggestions: (note.researchSuggestions as string[]) || [],
        }
      );

      if (result.success) {
        await db.update(notes).set({
          githubSynced: 1,
          githubPath: result.path,
        }).where(eq(notes.id, input.noteId));
      }

      return result;
    }),

  // Sync all unsynced notes to GitHub
  syncAllToGithub: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [config] = await db
      .select()
      .from(githubConfigs)
      .where(eq(githubConfigs.userId, ctx.user.id))
      .limit(1);

    if (!config || !config.githubToken || !config.repoOwner || !config.repoName) {
      throw new Error("GitHub 配置未完成");
    }

    const unsyncedNotes = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, ctx.user.id), eq(notes.githubSynced, 0), eq(notes.status, "done")));

    let successCount = 0;
    let failCount = 0;

    for (const note of unsyncedNotes) {
      const result = await syncNoteToGithub(
        {
          githubToken: config.githubToken,
          repoOwner: config.repoOwner,
          repoName: config.repoName,
          branch: config.branch || "main",
        },
        {
          ...note,
          tags: (note.tags as string[]) || [],
          researchSuggestions: (note.researchSuggestions as string[]) || [],
        }
      );

      if (result.success) {
        await db.update(notes).set({ githubSynced: 1, githubPath: result.path }).where(eq(notes.id, note.id));
        successCount++;
      } else {
        failCount++;
      }
    }

    // Update last sync time
    await db.update(githubConfigs).set({ lastSyncAt: new Date() }).where(eq(githubConfigs.userId, ctx.user.id));

    return { successCount, failCount, total: unsyncedNotes.length };
  }),

  // Get GitHub config
  getGithubConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    const [config] = await db
      .select({
        id: githubConfigs.id,
        repoOwner: githubConfigs.repoOwner,
        repoName: githubConfigs.repoName,
        branch: githubConfigs.branch,
        lastSyncAt: githubConfigs.lastSyncAt,
        hasToken: githubConfigs.githubToken,
      })
      .from(githubConfigs)
      .where(eq(githubConfigs.userId, ctx.user.id))
      .limit(1);

    if (!config) return null;
    return { ...config, hasToken: !!config.hasToken };
  }),

  // Save GitHub config
  saveGithubConfig: protectedProcedure
    .input(
      z.object({
        githubToken: z.string().optional(), // optional: keep existing if not provided
        repoOwner: z.string().min(1),
        repoName: z.string().min(1),
        branch: z.string().default("main"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get existing config to potentially reuse token
      const [existing] = await db
        .select()
        .from(githubConfigs)
        .where(eq(githubConfigs.userId, ctx.user.id))
        .limit(1);

      // Determine which token to use
      const tokenToUse = input.githubToken || existing?.githubToken;
      if (!tokenToUse) throw new Error("请提供 GitHub Token");

      // Validate config with actual token
      const validation = await validateGithubConfig({
        githubToken: tokenToUse,
        repoOwner: input.repoOwner,
        repoName: input.repoName,
        branch: input.branch,
      });
      if (!validation.valid) throw new Error(validation.error);

      const updateData = {
        githubToken: tokenToUse,
        repoOwner: input.repoOwner,
        repoName: input.repoName,
        branch: input.branch,
      };

      if (existing) {
        await db.update(githubConfigs).set(updateData).where(eq(githubConfigs.userId, ctx.user.id));
      } else {
        await db.insert(githubConfigs).values({ userId: ctx.user.id, ...updateData });
      }

      return { success: true };
    }),

  // Get all notes for graph view
  getGraph: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const allNotes = await db
      .select({ id: notes.id, title: notes.title, category: notes.category, tags: notes.tags })
      .from(notes)
      .where(and(eq(notes.userId, ctx.user.id), eq(notes.status, "done")));

    const allRelations = await db.select().from(noteRelations);

    // Filter relations to only include notes belonging to this user
    const noteIds = new Set(allNotes.map((n) => n.id));
    const userRelations = allRelations.filter(
      (r) => noteIds.has(r.sourceNoteId) && noteIds.has(r.targetNoteId)
    );

    return { nodes: allNotes, edges: userRelations };
  }),
});

// Helper: find and link related notes
async function findAndLinkRelatedNotes(
  userId: number,
  newNoteId: number,
  analysisResult: { title: string; tags: string[]; summary: string },
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
) {
  // Get recent notes for comparison (exclude the new one)
  const recentNotes = await db
    .select({ id: notes.id, title: notes.title, tags: notes.tags, summary: notes.summary })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.status, "done")))
    .orderBy(desc(notes.createdAt))
    .limit(30);

  const candidates = recentNotes
    .filter((n) => n.id !== newNoteId && n.title && n.summary)
    .map((n) => ({
      id: n.id,
      title: n.title!,
      tags: (n.tags as string[]) || [],
      summary: n.summary!,
    }));

  if (candidates.length === 0) return;

  const relations = await findRelatedNotes(
    { title: analysisResult.title, tags: analysisResult.tags, summary: analysisResult.summary },
    candidates
  );

  for (const rel of relations) {
    await db.insert(noteRelations).values({
      sourceNoteId: newNoteId,
      targetNoteId: rel.noteId,
      relationType: rel.relationType,
      description: rel.description,
    }).catch(() => {}); // Ignore duplicate errors
  }
}
