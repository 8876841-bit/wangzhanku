import { useState } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  getCategoryBadgeClass,
  formatRelativeTime,
  ALL_CATEGORIES,
} from "@/lib/noteUtils";
import type { NoteCategory } from "@/lib/noteUtils";

export default function Library() {
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialCategory = params.get("category") as NoteCategory | null;

  const [selectedCategory, setSelectedCategory] = useState<NoteCategory | undefined>(
    initialCategory || undefined
  );
  const [searchQuery, setSearchQuery] = useState("");

  const { data: notes, isLoading } = trpc.notes.list.useQuery(
    {
      category: selectedCategory,
      search: searchQuery || undefined,
      limit: 50,
      offset: 0,
    },
    { enabled: isAuthenticated }
  );

  const { data: stats } = trpc.notes.stats.useQuery(undefined, { enabled: isAuthenticated });

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
        <h1 className="text-xl font-bold text-foreground">知识库</h1>

        {/* Search */}
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索标题、内容、摘要..."
            className="w-full pl-9 pr-4 py-3 bg-white border border-border rounded-xl text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setSelectedCategory(undefined)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              !selectedCategory
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-white text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            全部 {stats?.total ? `(${stats.total})` : ""}
          </button>
          {ALL_CATEGORIES.map((cat) => {
            const count = stats?.byCategory[cat] || 0;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? undefined : cat)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  selectedCategory === cat
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                <span>{CATEGORY_ICONS[cat]}</span>
                <span>{CATEGORY_LABELS[cat]}</span>
                <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Notes Grid */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-border p-4 animate-pulse">
                <div className="h-3 bg-muted rounded w-1/4 mb-2" />
                <div className="h-4 bg-muted rounded w-3/4 mb-1.5" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : notes && notes.length > 0 ? (
          <div className="space-y-2">
            {notes.map((note) => (
              <Link key={note.id} href={`/note/${note.id}`}>
                <div className="bg-white rounded-xl border border-border p-4 hover:shadow-sm hover:border-primary/20 transition-all cursor-pointer active:scale-[0.99]">
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5 flex-shrink-0">{CATEGORY_ICONS[note.category as NoteCategory]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getCategoryBadgeClass(note.category)}`}>
                          {CATEGORY_LABELS[note.category as NoteCategory]}
                        </span>
                        {note.githubSynced === 1 && (
                          <span className="text-xs text-green-600 font-medium">✓ GitHub</span>
                        )}
                        {note.status === "processing" && (
                          <span className="text-xs text-amber-600 font-medium">⏳ 分析中</span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatRelativeTime(note.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate">
                        {note.title || note.rawText?.slice(0, 50) || "未命名"}
                      </p>
                      {note.summary && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{note.summary}</p>
                      )}
                      {/* Tags */}
                      {note.tags && (note.tags as string[]).length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {(note.tags as string[]).slice(0, 3).map((tag) => (
                            <span key={tag} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">
              {selectedCategory ? CATEGORY_ICONS[selectedCategory] : "📭"}
            </div>
            <p className="text-muted-foreground text-sm">
              {searchQuery
                ? `没有找到包含"${searchQuery}"的记录`
                : selectedCategory
                ? `还没有"${CATEGORY_LABELS[selectedCategory]}"类型的记录`
                : "还没有任何记录"}
            </p>
            {!searchQuery && (
              <Link href="/upload">
                <button className="mt-4 text-primary text-sm hover:underline">
                  去记录第一条 →
                </button>
              </Link>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
