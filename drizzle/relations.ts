import { relations } from "drizzle-orm";
import { entries, entryBatches, entryClusters, entryRelations, fusionResults, users } from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  entries: many(entries),
  batches: many(entryBatches),
  clusters: many(entryClusters),
}));

export const entryBatchesRelations = relations(entryBatches, ({ one, many }) => ({
  user: one(users, { fields: [entryBatches.userId], references: [users.id] }),
  entries: many(entries),
}));

export const entriesRelations = relations(entries, ({ one, many }) => ({
  user: one(users, { fields: [entries.userId], references: [users.id] }),
  batch: one(entryBatches, { fields: [entries.batchId], references: [entryBatches.id] }),
  cluster: one(entryClusters, { fields: [entries.clusterId], references: [entryClusters.id] }),
  sourceRelations: many(entryRelations, { relationName: "sourceRelations" }),
  targetRelations: many(entryRelations, { relationName: "targetRelations" }),
}));

export const entryRelationsRelations = relations(entryRelations, ({ one }) => ({
  sourceEntry: one(entries, {
    fields: [entryRelations.sourceEntryId],
    references: [entries.id],
    relationName: "sourceRelations",
  }),
  targetEntry: one(entries, {
    fields: [entryRelations.targetEntryId],
    references: [entries.id],
    relationName: "targetRelations",
  }),
}));

export const fusionResultsRelations = relations(fusionResults, ({ one }) => ({
  user: one(users, { fields: [fusionResults.userId], references: [users.id] }),
  entryA: one(entries, { fields: [fusionResults.entryAId], references: [entries.id] }),
  entryB: one(entries, { fields: [fusionResults.entryBId], references: [entries.id] }),
}));
